import { firebaseBlockPath, firebaseSegment, firebaseSprayerPath, toFirebaseControl } from "~/lib/shared/irrigation";
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
