import { createHash } from "node:crypto";
import { IrrigationMode, MoistureStatus, RelayState, SyncStatus } from "@prisma/client";
import { firebaseBlockPath, firebaseSegment, firebaseSprayerPath, toFirebaseControl } from "~/lib/shared/irrigation";
import { prisma } from "../../db/prisma";
import { firebaseAdminDb } from "./admin";

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

type FirebaseHistoryEntry = {
  duration?: number;
  endtime?: number;
  flow_Lmin?: number;
  mode?: "AUTO" | "MANUAL";
  moisture_percent?: number;
  moisture_status?: string;
  pump_status?: boolean;
  starttime?: number;
  timestamp?: number;
  totalVolume?: number;
};

type FirebaseSprayerNode = {
  control?: {
    mode?: "AUTO" | "MANUAL";
    pump_status?: boolean;
  };
  history?: Record<string, Record<string, FirebaseHistoryEntry>>;
  live_data?: {
    arah_angin?: string;
    flow_Lmin?: number;
    last_updated?: number;
    moisture_percent?: number;
    moisture_status?: string;
    totalVolume?: number;
  };
};

type FirebaseRegionNode = {
  blocks?: Record<string, Record<string, FirebaseSprayerNode>>;
  /**
   * Write-only mirror of the relational `Region` control settings. The app
   * never reads it back: the `Region` row is authoritative.
   */
  region_settings?: {
    batas_basah?: number;
    batas_kering?: number;
    mode_otomatis?: boolean;
    safety_timeout_min?: number;
    safety_timeout_max?: number;
  };
};

/**
 * Stable, bounded key for `sensor_reading.source_key` (VARCHAR(191)).
 * SHA-256 hex is 64 chars, so it always fits.
 */
function stableSourceKey(...parts: Array<string | number>) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function regionControlSettings(region: RegionNode) {
  return {
    batas_basah: region.wetMinPercent ?? 80,
    batas_kering: region.dryMaxPercent ?? 40,
    mode_otomatis: region.automaticMode ?? false,
    safety_timeout_min: region.safetyTimeoutMin ?? 1,
    safety_timeout_max: region.safetyTimeoutMax ?? 3,
  };
}

function fromEpoch(seconds?: number) {
  return new Date((seconds ?? Math.floor(Date.now() / 1000)) * 1000);
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

function numberOrZero(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function moistureStatus(value?: string): MoistureStatus {
  const normalized = value?.toLowerCase();
  if (normalized === "basah") return MoistureStatus.BASAH;
  if (normalized === "lembab") return MoistureStatus.LEMBAB;
  return MoistureStatus.KERING;
}

function relayState(value?: boolean): RelayState {
  return value ? RelayState.ON : RelayState.OFF;
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
  totalVolume: 0,
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

let inFlightSync: Promise<FirebaseSyncStats> | null = null;

export function syncFirebaseSnapshotToDatabase(input: { staleMs?: number } = {}): Promise<FirebaseSyncStats> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = runFirebaseSync(input).finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
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

    if (regions.length > 0) {
      const db = firebaseAdminDb();
      const snapshots = await Promise.allSettled(
        regions.map(async (region) => ({
          region,
          snapshot: await db.ref(firebaseSegment(region.name)).get(),
        })),
      );

      for (const result of snapshots) {
        if (result.status === "rejected") {
          hadFailure = true;
          console.error("[firebase] region snapshot failed:", result.reason);
          continue;
        }
        const { region, snapshot } = result.value;
        if (!snapshot.exists()) continue;

        const node = snapshot.val() as FirebaseRegionNode;
        stats.regions += 1;

        // Isolate region failures: one malformed region must not abort the
        // whole import, but the cycle is marked failed so the sync marker is
        // not advanced and the next scheduled refresh retries.
        try {
          for (const [blockName, sprayers] of Object.entries(node.blocks ?? {})) {
            if (blockName.startsWith("_")) continue;

            const block = await prisma.block.upsert({
              where: { regionId_name: { regionId: region.id, name: blockName } },
              update: {
                firebaseSyncStatus: SyncStatus.SYNCED,
                firebaseSyncedAt: new Date(),
              },
              create: {
                regionId: region.id,
                name: blockName,
                createdById: region.createdById,
                firebaseSyncStatus: SyncStatus.SYNCED,
                firebaseSyncedAt: new Date(),
              },
            });
            stats.blocks += 1;

            for (const [hardwareId, sprayerNode] of Object.entries(sprayers ?? {})) {
              if (hardwareId.startsWith("_")) continue;

              const sprayer = await prisma.sprayer.upsert({
                where: { blockId_hardwareId: { blockId: block.id, hardwareId } },
                update: {
                  isActive: true,
                  firebaseSyncStatus: SyncStatus.SYNCED,
                  firebaseSyncedAt: new Date(),
                },
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

              const live = sprayerNode.live_data;
              if (live) {
                // Without a device timestamp the source key would change every
                // cycle (fromEpoch would fall back to `Date.now()`), inserting
                // one row per second forever. Skip until the device reports it.
                const lastUpdated = live.last_updated;
                if (typeof lastUpdated !== "number" || !Number.isFinite(lastUpdated)) {
                  warnMissingLiveTimestamp(sprayer.id);
                } else {
                  const recordedAt = fromEpoch(lastUpdated);
                  const payloadKey = JSON.stringify(live, Object.keys(live).sort());
                  const sourceKey = stableSourceKey(
                    "live",
                    sprayer.id,
                    Math.floor(recordedAt.getTime() / 1000),
                    payloadKey,
                  );
                  const values = {
                    moisturePercent: numberOrZero(live.moisture_percent),
                    flowLmin: numberOrZero(live.flow_Lmin),
                    totalVolumeLiter: live.totalVolume === undefined ? null : numberOrZero(live.totalVolume),
                    moistureStatus: moistureStatus(live.moisture_status),
                    pumpStatus: sprayerNode.control?.pump_status ? "ON" : "OFF",
                    windDirection: live.arah_angin ?? null,
                  };
                  await prisma.sensorReading.upsert({
                    where: { sprayerId_sourceKey: { sprayerId: sprayer.id, sourceKey } },
                    // The source key hashes the full payload: a repeated key is
                    // already identical, so there is nothing to update.
                    update: {},
                    create: { sprayerId: sprayer.id, sourceKey, ...values, recordedAt },
                  });
                  stats.readings += 1;
                }
              }

              for (const [dateKey, entries] of Object.entries(sprayerNode.history ?? {})) {
                for (const [eventId, entry] of Object.entries(entries ?? {})) {
                  const firebaseEventId = `${region.name}/${blockName}/${hardwareId}/${dateKey}/${eventId}`;
                  const fbStartedAt = fromEpoch(entry.starttime ?? entry.timestamp);
                  const fbEndedAt = entry.endtime ? fromEpoch(entry.endtime) : null;
                  const fbDuration =
                    entry.endtime != null && entry.starttime != null
                      ? entry.endtime - entry.starttime
                      : (entry.duration ?? null);
                  const fbVolume = entry.totalVolume === undefined ? null : numberOrZero(entry.totalVolume);
                  const fbMode = entry.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;
                  const fbRelay = relayState(entry.pump_status);

                  const MATCH_MS = 5 * 60 * 1000;
                  const manualMatch = await prisma.irrigationEvent.findFirst({
                    where: {
                      sprayerId: sprayer.id,
                      firebaseEventId: null,
                      startedAt: {
                        gte: new Date(fbStartedAt.getTime() - MATCH_MS),
                        lte: new Date(fbStartedAt.getTime() + MATCH_MS),
                      },
                    },
                    orderBy: { startedAt: "desc" },
                  });

                  if (manualMatch) {
                    await prisma.irrigationEvent.update({
                      where: { id: manualMatch.id },
                      data: {
                        firebaseEventId,
                        firebaseDateKey: dateKey,
                        ...(fbEndedAt && !manualMatch.endedAt ? { endedAt: fbEndedAt } : {}),
                        ...(fbDuration !== null && manualMatch.durationSeconds === null
                          ? { durationSeconds: fbDuration }
                          : {}),
                        ...(fbVolume !== null ? { totalVolumeLiter: fbVolume } : {}),
                      },
                    });
                  } else {
                    await prisma.irrigationEvent.upsert({
                      where: { firebaseEventId },
                      update: {
                        sprayerId: sprayer.id,
                        mode: fbMode,
                        relay: fbRelay,
                        durationSeconds: fbDuration,
                        totalVolumeLiter: fbVolume,
                        firebaseDateKey: dateKey,
                        startedAt: fbStartedAt,
                        endedAt: fbEndedAt,
                      },
                      create: {
                        sprayerId: sprayer.id,
                        actorId: null,
                        mode: fbMode,
                        relay: fbRelay,
                        reason: "Imported from Firebase RTDB snapshot",
                        durationSeconds: fbDuration,
                        totalVolumeLiter: fbVolume,
                        firebaseEventId,
                        firebaseDateKey: dateKey,
                        startedAt: fbStartedAt,
                        endedAt: fbEndedAt,
                      },
                    });
                  }
                  stats.events += 1;

                  const recordedAt = fromEpoch(entry.timestamp ?? entry.endtime ?? entry.starttime);
                  const sourceKey = stableSourceKey("history", firebaseEventId);
                  const values = {
                    moisturePercent: numberOrZero(entry.moisture_percent),
                    flowLmin: numberOrZero(entry.flow_Lmin),
                    totalVolumeLiter: entry.totalVolume === undefined ? null : numberOrZero(entry.totalVolume),
                    moistureStatus: moistureStatus(entry.moisture_status),
                    pumpStatus: entry.pump_status ? "ON" : "OFF",
                  };
                  await prisma.sensorReading.upsert({
                    where: { sprayerId_sourceKey: { sprayerId: sprayer.id, sourceKey } },
                    update: values,
                    create: { sprayerId: sprayer.id, sourceKey, ...values, recordedAt },
                  });
                  stats.readings += 1;
                }
              }
            }
          }
        } catch (error) {
          hadFailure = true;
          console.error(`[firebase] region import failed (${region.name}):`, error);
        }
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
  }

  return stats;
}
