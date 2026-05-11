import { firebaseSegment, toFirebaseControl } from "~/domain/irrigation";
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
    ".provisioned": true,
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
  const regionKey = firebaseSegment(block.regionName);
  const blockKey = firebaseSegment(block.blockName);
  await db.ref(`${regionKey}/${blockKey}`).update({
    ".provisioned": true,
    ...(block.sprayers ?? {}),
  });
}

export async function renameBlockNode(oldBlockName: string, block: BlockNode) {
  const db = firebaseAdminDb();
  const regionKey = firebaseSegment(block.regionName);
  const oldKey = firebaseSegment(oldBlockName);
  const newKey = firebaseSegment(block.blockName);
  if (oldKey === newKey) return provisionBlockNode(block);

  const snapshot = await db.ref(`${regionKey}/${oldKey}`).get();
  await db.ref(`${regionKey}/${newKey}`).set(snapshot.exists() ? snapshot.val() : { ".provisioned": true });
  await db.ref(`${regionKey}/${oldKey}`).remove();
}

export async function provisionSprayerNode(sprayer: SprayerNode) {
  const db = firebaseAdminDb();
  const regionKey = firebaseSegment(sprayer.regionName);
  const blockKey = firebaseSegment(sprayer.blockName);
  const sprayerKey = firebaseSegment(sprayer.hardwareId);

  await db.ref(`${regionKey}/${blockKey}/${sprayerKey}`).set({
    control: toFirebaseControl("AUTO", "OFF"),
    data: {
      flow_Lmin: "0.00",
      moisture_percent: "0.0",
      moisture_status: "Kering",
      status_pompa: "STANDBY",
    },
    setting: {
      batas_basah: sprayer.wetMinPercent,
      batas_kering: sprayer.dryMaxPercent,
    },
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
  const regionKey = firebaseSegment(input.regionName);
  const blockKey = firebaseSegment(input.blockName);
  const sprayerKey = firebaseSegment(input.hardwareId);
  await db.ref(`${regionKey}/${blockKey}/${sprayerKey}/control`).set(toFirebaseControl(input.mode, input.relay));
}
