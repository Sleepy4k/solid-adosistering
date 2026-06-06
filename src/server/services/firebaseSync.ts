import { IrrigationMode, MoistureStatus, RelayState, SyncStatus } from "@prisma/client";
import { firebaseBlockPath, firebaseSegment, firebaseSprayerPath, toFirebaseControl } from "~/lib/shared/irrigation";
import { prisma } from "../db/prisma";
import { firebaseAdminDb } from "./firebaseAdmin";

type RegionNode = {
  name: string;
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
  region_settings?: {
    batas_basah?: number;
    batas_kering?: number;
    mode_otomatis?: boolean;
  };
};

function fromEpoch(seconds?: number) {
  return new Date((seconds ?? Math.floor(Date.now() / 1000)) * 1000);
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
  const regionKey = firebaseSegment(region.name);
  await db.ref(regionKey).update({
    region_settings: {
      batas_basah: 80,
      batas_kering: 40,
      mode_otomatis: false,
    },
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
  await db.ref(newKey).set(snapshot.exists() ? snapshot.val() : { ".provisioned": true });
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

export async function provisionSprayerNode(sprayer: SprayerNode) {
  const db = firebaseAdminDb();
  await db.ref(firebaseSprayerPath(sprayer.regionName, sprayer.blockName, sprayer.hardwareId)).set({
    control: toFirebaseControl("AUTO", "OFF"),
    history: {},
    live_data: {
      arah_angin: "barat laut",
      flow_Lmin: 0,
      last_updated: Math.floor(Date.now() / 1000),
      moisture_percent: 0,
      moisture_status: "Kering",
      totalVolume: 0,
    },
  });

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
}) {
  const db = firebaseAdminDb();
  await db.ref(`${firebaseSegment(input.regionName)}/region_settings`).update({
    batas_basah: input.wetMinPercent,
    batas_kering: input.dryMaxPercent,
    ...(typeof input.automaticMode === "boolean" ? { mode_otomatis: input.automaticMode } : {}),
  });
}

export async function syncFirebaseSnapshotToDatabase(input: { staleMs?: number } = {}) {
  const staleMs = input.staleMs ?? 60_000;
  const syncKey = "firebase_sync:snapshot";
  const marker = await prisma.systemSetting.findUnique({ where: { key: syncKey } });
  const markerValue = marker?.value as { syncedAt?: string } | null;
  if (shouldSkipSync(markerValue?.syncedAt, staleMs)) {
    return { skipped: true, regions: 0, blocks: 0, sprayers: 0, readings: 0, events: 0 };
  }

  const regions = await prisma.region.findMany({
    select: { id: true, name: true, createdById: true },
    orderBy: { name: "asc" },
  });
  if (regions.length === 0) return { skipped: false, regions: 0, blocks: 0, sprayers: 0, readings: 0, events: 0 };

  const db = firebaseAdminDb();
  const stats = { skipped: false, regions: 0, blocks: 0, sprayers: 0, readings: 0, events: 0 };

  for (const region of regions) {
    const snapshot = await db.ref(firebaseSegment(region.name)).get();
    if (!snapshot.exists()) continue;

    const node = snapshot.val() as FirebaseRegionNode;
    stats.regions += 1;

    if (node.region_settings) {
      await prisma.systemSetting.upsert({
        where: { key: `region_settings:${region.name}` },
        update: { value: node.region_settings },
        create: { key: `region_settings:${region.name}`, value: node.region_settings },
      });
    }

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
            displayName: hardwareId.replace(/_/g, " "),
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
          const recordedAt = fromEpoch(live.last_updated);
          const exists = await prisma.sensorReading.findFirst({
            where: { blockId: block.id, sprayerId: sprayer.id, recordedAt },
            select: { id: true },
          });
          if (!exists) {
            await prisma.sensorReading.create({
              data: {
                blockId: block.id,
                sprayerId: sprayer.id,
                moisturePercent: numberOrZero(live.moisture_percent),
                flowLmin: numberOrZero(live.flow_Lmin),
                totalVolumeLiter: live.totalVolume === undefined ? null : numberOrZero(live.totalVolume),
                moistureStatus: moistureStatus(live.moisture_status),
                pumpStatus: sprayerNode.control?.pump_status ? "ON" : "OFF",
                windDirection: live.arah_angin ?? null,
                recordedAt,
              },
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
                  blockId: block.id,
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
                  blockId: block.id,
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
            const exists = await prisma.sensorReading.findFirst({
              where: { blockId: block.id, sprayerId: sprayer.id, recordedAt },
              select: { id: true },
            });
            if (!exists) {
              await prisma.sensorReading.create({
                data: {
                  blockId: block.id,
                  sprayerId: sprayer.id,
                  moisturePercent: numberOrZero(entry.moisture_percent),
                  flowLmin: numberOrZero(entry.flow_Lmin),
                  totalVolumeLiter: entry.totalVolume === undefined ? null : numberOrZero(entry.totalVolume),
                  moistureStatus: moistureStatus(entry.moisture_status),
                  pumpStatus: entry.pump_status ? "ON" : "OFF",
                  recordedAt,
                },
              });
              stats.readings += 1;
            }
          }
        }
      }
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: syncKey },
    update: { value: { syncedAt: new Date().toISOString(), stats } },
    create: { key: syncKey, value: { syncedAt: new Date().toISOString(), stats } },
  });

  return stats;
}
