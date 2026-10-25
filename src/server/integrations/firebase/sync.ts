import { SyncStatus } from "@prisma/client";
import { firebaseBlockPath, firebaseSegment, firebaseSprayerPath, toFirebaseControl } from "~/lib/shared/irrigation";
import { serverConfig } from "../../config";
import { prisma } from "../../db/prisma";
import { firebaseAdminApp, firebaseAdminDb } from "./admin";
import { clampNumber, fromEpoch, liveTotalLiter, moistureStatus, stableSourceKey } from "./convert";
import { importSprayerHistory, type HistorySprayerTarget } from "./historyImport";
import { recentHistoryDateKeys } from "./historyNormalize";

type RegionNode = {
  name: string;
  dryMaxPercent?: number;
  wetMinPercent?: number;
  automaticMode?: boolean;
  safetyTimeoutMin?: number;
  safetyTimeoutMax?: number;
};

type BlockNode = {
  regionName: string;
  blockName: string;
  sprayers?: Record<string, unknown>;
};

type SprayerNode = {
  regionName: string;
  blockName: string;
  hardwareId: string;
  dryMaxPercent: number;
  wetMinPercent: number;
};

type FirebaseSprayerNode = {
  control?: {
    mode?: "AUTO" | "MANUAL";
    pump_status?: boolean;
  };
  live_data?: {
    arah_angin?: string;
    flow_Lmin?: number;
    last_updated?: number;
    moisture_percent?: number;
    moisture_status?: string;
    total_liter?: number;
    totalVolume?: number;
  };
  history?: unknown;
};

function regionControlSettings(region: RegionNode) {
  return {
    batas_basah: region.wetMinPercent ?? 80,
    batas_kering: region.dryMaxPercent ?? 40,
    mode_otomatis: region.automaticMode ?? false,
    safety_timeout_min: region.safetyTimeoutMin ?? 1,
    safety_timeout_max: region.safetyTimeoutMax ?? 3,
  };
}

const MAX_LOGGED_LIVE_TIMESTAMP_WARNINGS = 1_000;
const warnedMissingLiveTimestamp = new Set<string>();

/**
 * Warn once per sprayer and process, bounded so a fleet-wide missing
 * `last_updated` cannot grow the set (or the logs) without limit.
 */
function warnMissingLiveTimestamp(sprayerId: string) {
  if (warnedMissingLiveTimestamp.has(sprayerId)) return;
  if (warnedMissingLiveTimestamp.size >= MAX_LOGGED_LIVE_TIMESTAMP_WARNINGS) return;
  warnedMissingLiveTimestamp.add(sprayerId);
  console.warn(`[firebase] live_data.last_updated missing for sprayer ${sprayerId}; skipping live reading.`);
}

function shouldSkipSync(lastSyncedAt: string | undefined, staleMs: number) {
  if (!lastSyncedAt) return false;
  const lastTime = new Date(lastSyncedAt).getTime();
  return Number.isFinite(lastTime) && Date.now() - lastTime < staleMs;
}

export async function provisionRegionNode(region: RegionNode) {
  const db = firebaseAdminDb();
  const ref = db.ref(firebaseSegment(region.name));
  const snapshot = await ref.get();

  // Existing region nodes keep their `blocks` children during (re-)provisioning.
  // The relational `Region` row is authoritative for control settings; Firebase
  // `region_settings` is write-only from this app and is never read back.
  if (snapshot.exists()) {
    await ref.update({ _meta: { provisioned: true } });
    return;
  }

  await ref.update({
    region_settings: regionControlSettings(region),
    blocks: {},
    _meta: { provisioned: true },
  });
}

export async function renameRegionNode(oldName: string, newRegion: RegionNode) {
  const db = firebaseAdminDb();
  const oldKey = firebaseSegment(oldName);
  const newKey = firebaseSegment(newRegion.name);
  if (oldKey === newKey) return provisionRegionNode(newRegion);

  const snapshot = await db.ref(oldKey).get();
  await db.ref(newKey).set(snapshot.exists() ? snapshot.val() : {});
  await db.ref(oldKey).remove();
}

export async function provisionBlockNode(block: BlockNode) {
  const db = firebaseAdminDb();
  await db.ref(firebaseBlockPath(block.regionName, block.blockName)).update({
    _meta: { provisioned: true },
    ...(block.sprayers ?? {}),
  });
}

export async function renameBlockNode(oldBlockName: string, block: BlockNode) {
  const db = firebaseAdminDb();
  const regionKey = firebaseSegment(block.regionName);
  const oldKey = firebaseSegment(oldBlockName);
  const newKey = firebaseSegment(block.blockName);
  if (oldKey === newKey) return provisionBlockNode(block);

  const snapshot = await db.ref(`${regionKey}/blocks/${oldKey}`).get();
  await db
    .ref(`${regionKey}/blocks/${newKey}`)
    .set(snapshot.exists() ? snapshot.val() : { _meta: { provisioned: true } });
  await db.ref(`${regionKey}/blocks/${oldKey}`).remove();
}

const defaultLiveData = () => ({
  arah_angin: "barat laut",
  flow_Lmin: 0,
  last_updated: Math.floor(Date.now() / 1000),
  moisture_percent: 0,
  moisture_status: "Kering",
  total_liter: 0,
});

export async function provisionSprayerNode(sprayer: SprayerNode) {
  const db = firebaseAdminDb();
  const ref = db.ref(firebaseSprayerPath(sprayer.regionName, sprayer.blockName, sprayer.hardwareId));
  const snapshot = await ref.get();

  if (!snapshot.exists()) {
    await ref.update({
      control: toFirebaseControl("AUTO", "OFF"),
      history: {},
      live_data: defaultLiveData(),
    });
  } else {
    const existing = snapshot.val() as FirebaseSprayerNode;
    const updates: Record<string, unknown> = {};
    if (!existing.control) updates.control = toFirebaseControl("AUTO", "OFF");
    if (!existing.history) updates.history = {};

    const liveDefaults = defaultLiveData();
    if (!existing.live_data) {
      updates.live_data = liveDefaults;
    } else {
      const missingDefaults: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(liveDefaults)) {
        if (!(key in existing.live_data)) missingDefaults[key] = value;
      }
      if (Object.keys(missingDefaults).length > 0) updates.live_data = missingDefaults;
    }

    // `update` merges into existing control/history/live_data; nothing the
    // device already wrote is reset.
    if (Object.keys(updates).length > 0) await ref.update(updates);
  }

  await db.ref(`${firebaseSegment(sprayer.regionName)}/region_settings`).update({
    batas_basah: sprayer.wetMinPercent,
    batas_kering: sprayer.dryMaxPercent,
  });
}

export async function updateSprayerControl(input: {
  regionName: string;
  blockName: string;
  hardwareId: string;
  mode: "AUTO" | "MANUAL";
  relay: "OFF" | "ON";
}) {
  const db = firebaseAdminDb();
  await db
    .ref(`${firebaseSprayerPath(input.regionName, input.blockName, input.hardwareId)}/control`)
    .set(toFirebaseControl(input.mode, input.relay));
}

export async function updateRegionSettings(input: {
  regionName: string;
  dryMaxPercent: number;
  wetMinPercent: number;
  automaticMode?: boolean;
  safetyTimeoutMin?: number;
  safetyTimeoutMax?: number;
}) {
  const db = firebaseAdminDb();
  await db.ref(`${firebaseSegment(input.regionName)}/region_settings`).update({
    batas_basah: input.wetMinPercent,
    batas_kering: input.dryMaxPercent,
    ...(typeof input.automaticMode === "boolean" ? { mode_otomatis: input.automaticMode } : {}),
    ...(typeof input.safetyTimeoutMin === "number" ? { safety_timeout_min: input.safetyTimeoutMin } : {}),
    ...(typeof input.safetyTimeoutMax === "number" ? { safety_timeout_max: input.safetyTimeoutMax } : {}),
  });
}

type FirebaseSyncStats = {
  skipped: boolean;
  regions: number;
  blocks: number;
  sprayers: number;
  readings: number;
  events: number;
};

const SHALLOW_TIMEOUT_MS = 8_000;
const SPRAYER_CONCURRENCY = 6;

/**
 * Child keys of `path` without downloading the subtree. The Admin SDK has no
 * shallow read, and a plain `get()` on a block would pull every sprayer's
 * whole history just to learn its name, so this uses the REST `shallow=true`
 * query with the Admin credential and falls back to `get()` if that fails.
 * Returns `null` when the node does not exist.
 */
async function childKeys(path: string): Promise<string[] | null> {
  const databaseUrl = serverConfig.firebase.databaseUrl;
  try {
    const token = await firebaseAdminApp().options.credential?.getAccessToken();
    if (databaseUrl && token?.access_token) {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`${databaseUrl.replace(/\/+$/, "")}/${encoded}.json?shallow=true`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(SHALLOW_TIMEOUT_MS),
      });
      if (response.ok) {
        const body: unknown = await response.json();
        if (body === null) return null;
        return body && typeof body === "object" ? Object.keys(body) : [];
      }
    }
  } catch (error) {
    console.warn(`[firebase] shallow read failed for ${path}; falling back to a full read:`, error);
  }

  const snapshot = await firebaseAdminDb().ref(path).get();
  if (!snapshot.exists()) return null;
  const value: unknown = snapshot.val();
  return value && typeof value === "object" ? Object.keys(value) : [];
}

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await run(item);
    }
  });
  await Promise.all(workers);
}

let inFlightSync: Promise<FirebaseSyncStats> | null = null;

export function syncFirebaseSnapshotToDatabase(input: { staleMs?: number } = {}): Promise<FirebaseSyncStats> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = runFirebaseSync(input).finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
}

/**
 * Store the live reading of one sprayer. Skipped without a device timestamp:
 * the source key would otherwise change every cycle (`fromEpoch` falls back to
 * `Date.now()`), inserting one row per second forever.
 */
async function storeLiveReading(
  sprayerId: string,
  live: NonNullable<FirebaseSprayerNode["live_data"]>,
  control: FirebaseSprayerNode["control"],
) {
  const lastUpdated = live.last_updated;
  if (typeof lastUpdated !== "number" || !Number.isFinite(lastUpdated)) {
    warnMissingLiveTimestamp(sprayerId);
    return 0;
  }

  const recordedAt = fromEpoch(lastUpdated);
  const payloadKey = JSON.stringify(live, Object.keys(live).sort());
  const sourceKey = stableSourceKey("live", sprayerId, Math.floor(recordedAt.getTime() / 1000), payloadKey);
  const totalVolumeLiter = liveTotalLiter(live);

  // The source key hashes the full payload: a repeated key is already
  // identical, so a skipped duplicate means the device sent nothing new.
  const { count } = await prisma.sensorReading.createMany({
    skipDuplicates: true,
    data: [
      {
        sprayerId,
        sourceKey,
        moisturePercent: clampNumber(live.moisture_percent, 0, 100),
        flowLmin: clampNumber(live.flow_Lmin, 0, 999_999),
        totalVolumeLiter: totalVolumeLiter === null ? null : clampNumber(totalVolumeLiter, 0, 9_999_999_999),
        moistureStatus: moistureStatus(live.moisture_status),
        pumpStatus: control?.pump_status ? "ON" : "OFF",
        windDirection: live.arah_angin?.slice(0, 100) ?? null,
        recordedAt,
      },
    ],
  });
  return count;
}

/**
 * Cheap, repeatable import for one sprayer: its live reading plus the date
 * nodes that can still change. The full history is read once by
 * `ensureSprayerHistory`.
 */
async function syncSprayer(target: HistorySprayerTarget, stats: FirebaseSyncStats) {
  const db = firebaseAdminDb();
  const path = firebaseSprayerPath(target.regionName, target.blockName, target.hardwareId);
  const [liveSnapshot, controlSnapshot] = await Promise.all([
    db.ref(`${path}/live_data`).get(),
    db.ref(`${path}/control`).get(),
  ]);

  try {
    if (liveSnapshot.exists()) {
      const live = liveSnapshot.val() as NonNullable<FirebaseSprayerNode["live_data"]>;
      const control = controlSnapshot.exists() ? (controlSnapshot.val() as FirebaseSprayerNode["control"]) : undefined;
      const inserted = await storeLiveReading(target.id, live, control);
      stats.readings += inserted;
      // "Latest data update": advance it only when the device reported
      // something new, so an offline device does not look freshly updated.
      if (inserted > 0) {
        await prisma.sprayer.update({ where: { id: target.id }, data: { firebaseSyncedAt: new Date() } });
      }
    }
  } finally {
    // A bad live value must not stop the history backup for this sprayer.
    const history = await ensureSprayerHistory(target);
    stats.events += history.created + history.updated;
  }
}

const BACKFILL_KEY_PREFIX = "firebase_history:backfill:";

/**
 * Bring one sprayer's history up to date. The first call reads the whole
 * `history` node once (every date key, including mistyped ones) and records a
 * marker; afterwards only today's and yesterday's date nodes are re-read,
 * because older days are immutable and already stored.
 */
export async function ensureSprayerHistory(target: HistorySprayerTarget) {
  const key = `${BACKFILL_KEY_PREFIX}${target.id}`;
  const marker = await prisma.systemSetting.findUnique({ where: { key }, select: { key: true } });

  if (marker) {
    // Recent days are always re-read. Any older date node that was never
    // stored (the app was not visited for days, or an earlier import failed)
    // is picked up too, so a gap can never become a permanent hole.
    const dateKeys = new Set(recentHistoryDateKeys());
    const base = `${firebaseSprayerPath(target.regionName, target.blockName, target.hardwareId)}/history`;
    const remote = (await childKeys(base)) ?? [];
    if (remote.length > 0) {
      const stored = await prisma.irrigationEvent.findMany({
        where: { sprayerId: target.id, firebaseDateKey: { in: remote } },
        distinct: ["firebaseDateKey"],
        select: { firebaseDateKey: true },
      });
      const have = new Set(stored.map((row) => row.firebaseDateKey));
      for (const dateKey of remote) if (!have.has(dateKey)) dateKeys.add(dateKey);
    }
    return importSprayerHistory(target, { dateKeys: [...dateKeys] });
  }

  const result = await importSprayerHistory(target, "all");
  const value = { backfilledAt: new Date().toISOString(), entries: result.entries };
  await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return result;
}

const PRUNE_KEY = "maintenance:prune_sensor_readings";
const PRUNE_BATCH = 5_000;
const PRUNE_MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The website database is the permanent backup of Firebase data: it must keep
 * serving history and statistics even after Firebase is shut down. Retention is
 * therefore OFF by default. Set `SENSOR_READING_RETENTION_DAYS` to a positive
 * number only to cap raw sensor rows; the daily prune then deletes rows older
 * than that in small batches so no statement holds locks for long. Irrigation
 * events are never pruned.
 */
async function pruneOldSensorReadings() {
  const raw = Number(process.env.SENSOR_READING_RETENTION_DAYS ?? 0);
  const days = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  if (days === 0) return;

  const marker = await prisma.systemSetting.findUnique({ where: { key: PRUNE_KEY } });
  const lastRun = (marker?.value as { ranAt?: string } | null)?.ranAt;
  if (shouldSkipSync(lastRun, DAY_MS)) return;

  const cutoff = new Date(Date.now() - days * DAY_MS);
  let deleted = 0;
  for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch++) {
    const count =
      await prisma.$executeRaw`DELETE FROM sensor_reading WHERE recorded_at < ${cutoff} LIMIT ${PRUNE_BATCH}`;
    deleted += count;
    if (count < PRUNE_BATCH) break;
  }

  const value = { ranAt: new Date().toISOString(), deleted, retentionDays: days };
  await prisma.systemSetting.upsert({
    where: { key: PRUNE_KEY },
    update: { value },
    create: { key: PRUNE_KEY, value },
  });
}

async function runFirebaseSync(input: { staleMs?: number } = {}) {
  const staleMs = input.staleMs ?? 60_000;
  const syncKey = "firebase_sync:snapshot";
  const marker = await prisma.systemSetting.findUnique({ where: { key: syncKey } });
  const markerValue = marker?.value as { syncedAt?: string } | null;
  if (shouldSkipSync(markerValue?.syncedAt, staleMs)) {
    return { skipped: true, regions: 0, blocks: 0, sprayers: 0, readings: 0, events: 0 };
  }

  const stats: FirebaseSyncStats = { skipped: false, regions: 0, blocks: 0, sprayers: 0, readings: 0, events: 0 };
  let hadFailure = false;

  try {
    const regions = await prisma.region.findMany({
      select: { id: true, name: true, createdById: true },
      orderBy: { name: "asc" },
    });
    // Enforce FIREBASE_SYNC_DISABLED / missing config before any Firebase read
    // (the shallow REST reads below do not go through this guard themselves).
    if (regions.length > 0) firebaseAdminDb();

    // Region failures are isolated: one malformed region must not abort the
    // whole import, but the cycle is marked failed so the sync marker is not
    // advanced and the next scheduled refresh retries.
    const results = await Promise.allSettled(
      regions.map(async (region) => {
        const regionKey = firebaseSegment(region.name);
        const blockNames = await childKeys(`${regionKey}/blocks`);
        if (blockNames === null) return;
        stats.regions += 1;

        const targets: HistorySprayerTarget[] = [];
        for (const blockName of blockNames) {
          if (blockName.startsWith("_")) continue;
          const hardwareIds = (await childKeys(`${regionKey}/blocks/${firebaseSegment(blockName)}`)) ?? [];

          const block = await prisma.block.upsert({
            where: { regionId_name: { regionId: region.id, name: blockName } },
            update: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
            create: {
              regionId: region.id,
              name: blockName,
              createdById: region.createdById,
              firebaseSyncStatus: SyncStatus.SYNCED,
              firebaseSyncedAt: new Date(),
            },
          });
          stats.blocks += 1;

          for (const hardwareId of hardwareIds) {
            if (hardwareId.startsWith("_")) continue;
            const sprayer = await prisma.sprayer.upsert({
              where: { blockId_hardwareId: { blockId: block.id, hardwareId } },
              update: { isActive: true, firebaseSyncStatus: SyncStatus.SYNCED },
              create: {
                blockId: block.id,
                hardwareId,
                displayName: hardwareId.replace(/_/g, " "),
                isActive: true,
                firebaseSyncStatus: SyncStatus.SYNCED,
                firebaseSyncedAt: new Date(),
              },
            });
            stats.sprayers += 1;
            targets.push({ id: sprayer.id, regionName: region.name, blockName, hardwareId });
          }
        }

        await mapLimit(targets, SPRAYER_CONCURRENCY, async (target) => {
          try {
            await syncSprayer(target, stats);
          } catch (error) {
            hadFailure = true;
            console.error(
              `[firebase] sprayer import failed (${region.name}/${target.blockName}/${target.hardwareId}):`,
              error,
            );
          }
        });
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        hadFailure = true;
        console.error("[firebase] region import failed:", result.reason);
      }
    }
  } catch (error) {
    // An unexpected cycle failure must leave the marker untouched so the next
    // scheduled refresh retries; the original error keeps propagating.
    console.error("[firebase] sync cycle failed:", error);
    throw error;
  }

  if (!hadFailure) {
    try {
      await prisma.systemSetting.upsert({
        where: { key: syncKey },
        update: { value: { syncedAt: new Date().toISOString(), stats } },
        create: { key: syncKey, value: { syncedAt: new Date().toISOString(), stats } },
      });
    } catch (error) {
      // A marker write failure must never mask the sync result.
      console.error("[firebase] failed to advance sync marker:", error);
    }

    // Housekeeping must never fail or delay the sync result.
    void pruneOldSensorReadings().catch((error: unknown) => {
      console.error("[firebase] sensor reading prune failed:", error);
    });
  }

  return stats;
}
