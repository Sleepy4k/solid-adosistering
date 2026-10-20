"use server";

import type { MoistureStatus } from "@prisma/client";
import { ActivityAction, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { updateRegionSettings } from "../integrations/firebase";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { parseInput, saveRegionSafetyTimeoutSchema, saveSafetyTimeoutSchema, saveThresholdSchema } from "../validation";
import {
  displayThresholdDefaults,
  getRegionSafetyTimeoutMap,
  getRegionThresholdMap,
  getSafetyTimeoutDefault,
  normalizeSafetyTimeout,
  normalizePreference,
  SAFETY_TIMEOUT_KEY,
  logActivity,
  type RegionThreshold,
} from "../domain";

function requireThreshold(map: Map<string, RegionThreshold>, regionId: string) {
  const threshold = map.get(regionId);
  if (!threshold) throw new Error(`Threshold region ${regionId} tidak tersedia.`);
  return threshold;
}

/**
 * Reflect the Firebase mirror state on the relational region row. SQL stays
 * authoritative, so a failed RTDB push only flags the row for retry.
 *
 * A settings-only push must never mask an existing FAILED state: a failed
 * rename/provisioning leaves blocks orphaned under the old RTDB node, and
 * silently marking the region SYNCED would hide that.
 */
async function persistRegionSyncStatus(regionId: string, status: SyncStatus) {
  try {
    if (status === SyncStatus.SYNCED) {
      await prisma.region.updateMany({
        where: { id: regionId, firebaseSyncStatus: { not: SyncStatus.FAILED } },
        data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
      });
      return;
    }

    await prisma.region.update({
      where: { id: regionId },
      data: { firebaseSyncStatus: SyncStatus.FAILED, firebaseSyncedAt: null },
    });
  } catch (error) {
    console.error("[firebase] region sync status update failed", error);
  }
}

export async function getMySettings() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const safetyTimeout = await getSafetyTimeoutDefault();

  if (session.role === "SUPERADMIN") {
    return { role: session.role as "SUPERADMIN", regions: [], safetyTimeout };
  }

  if (session.role === "ADMIN") {
    const assignments = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      include: { region: { include: { _count: { select: { blocks: true } } } } },
    });
    const regionIds = assignments.map((a) => a.regionId);
    const thresholdMap = await getRegionThresholdMap(session.id, regionIds);
    const safetyTimeoutMap = await getRegionSafetyTimeoutMap(regionIds, safetyTimeout);

    return {
      role: "ADMIN" as const,
      regions: assignments.map((a) => ({
        id: a.region.id,
        name: a.region.name,
        blockCount: a.region._count.blocks,
        threshold: requireThreshold(thresholdMap, a.region.id),
        safetyTimeout: safetyTimeoutMap.get(a.region.id) ?? safetyTimeout,
      })),
    };
  }

  const assignments = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    include: { region: { include: { _count: { select: { blocks: true } } } } },
  });
  const regionIds = assignments.map((a) => a.regionId);
  const thresholdMap = await getRegionThresholdMap(session.id, regionIds);
  const safetyTimeoutMap = await getRegionSafetyTimeoutMap(regionIds, safetyTimeout);

  return {
    role: "USER" as const,
    regions: assignments.map((a) => ({
      id: a.region.id,
      name: a.region.name,
      blockCount: a.region._count.blocks,
      threshold: requireThreshold(thresholdMap, a.region.id),
      safetyTimeout: safetyTimeoutMap.get(a.region.id) ?? safetyTimeout,
    })),
    safetyTimeout,
  };
}

export async function saveThreshold(input: {
  regionId: string;
  dryMaxPercent: number;
  wetMinPercent: number;
  displayDryMaxPercent?: number;
  displayMoistMaxPercent?: number;
  displayWetMinPercent?: number;
  landPreference?: MoistureStatus | string;
}) {
  const data = parseInput(saveThresholdSchema, input);
  if (data.dryMaxPercent >= data.wetMinPercent) {
    throw new Response("Batas kering harus lebih kecil dari batas basah.", { status: 400 });
  }
  const displayThresholds = displayThresholdDefaults(data);
  if (displayThresholds.displayDryMaxPercent >= displayThresholds.displayWetMinPercent) {
    throw new Response("Batas tampilan kering harus lebih kecil dari batas tampilan basah.", { status: 400 });
  }
  const session = await getSession();
  if (!session) throw redirect("/login");
  let region: { name: string; automaticMode: boolean } | null = null;

  if (session.role === "USER") {
    const assignment = await prisma.userRegionAssignment.findUnique({
      where: { userId_regionId: { userId: session.id, regionId: data.regionId } },
      include: { region: { select: { name: true, automaticMode: true } } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses user.", { status: 403 });
    region = assignment.region;
  } else if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: data.regionId } },
      include: { region: { select: { name: true, automaticMode: true } } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
    region = assignment.region;
  } else {
    throw new Response("Pengaturan region hanya tersedia untuk Admin atau User.", { status: 403 });
  }

  const landPreference = normalizePreference(data.landPreference);
  await prisma.$transaction([
    prisma.region.update({
      where: { id: data.regionId },
      data: {
        dryMaxPercent: data.dryMaxPercent,
        wetMinPercent: data.wetMinPercent,
        updatedById: session.id,
      },
    }),
    prisma.indicatorThreshold.upsert({
      where: { userId_regionId: { userId: session.id, regionId: data.regionId } },
      create: {
        userId: session.id,
        regionId: data.regionId,
        ...displayThresholds,
        landPreference,
      },
      update: {
        ...displayThresholds,
        landPreference,
      },
    }),
  ]);

  try {
    await updateRegionSettings({
      regionName: region.name,
      dryMaxPercent: data.dryMaxPercent,
      wetMinPercent: data.wetMinPercent,
      automaticMode: region.automaticMode,
    });
    await persistRegionSyncStatus(data.regionId, SyncStatus.SYNCED);
  } catch (error) {
    console.error("[firebase] updateRegionSettings", error);
    await persistRegionSyncStatus(data.regionId, SyncStatus.FAILED);
  }

  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.UPDATE,
    entityType: "IndicatorThreshold",
    entityId: data.regionId,
    metadata: {
      dryMaxPercent: data.dryMaxPercent,
      wetMinPercent: data.wetMinPercent,
      ...displayThresholds,
      landPreference,
    },
  });
  return { ok: true };
}

export async function saveSafetyTimeout(input: { min: number; max: number }) {
  const data = parseInput(saveSafetyTimeoutSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role !== "SUPERADMIN") throw new Response("Forbidden", { status: 403 });
  const { min, max } = normalizeSafetyTimeout(data);

  await prisma.systemSetting.upsert({
    where: { key: SAFETY_TIMEOUT_KEY },
    create: { key: SAFETY_TIMEOUT_KEY, value: { min, max } },
    update: { value: { min, max } },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: SAFETY_TIMEOUT_KEY,
    metadata: { min, max },
  });
  return { ok: true };
}

export async function saveRegionSafetyTimeout(input: { regionId: string; min: number; max: number }) {
  const data = parseInput(saveRegionSafetyTimeoutSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") throw new Response("Pengaturan region hanya tersedia untuk Admin.", { status: 403 });

  const { min, max } = normalizeSafetyTimeout(data);
  const regionSelect = {
    name: true,
    dryMaxPercent: true,
    wetMinPercent: true,
    automaticMode: true,
  } as const;

  let region: {
    name: string;
    dryMaxPercent: number;
    wetMinPercent: number;
    automaticMode: boolean;
  } | null = null;

  if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: data.regionId } },
      include: { region: { select: regionSelect } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
    region = assignment.region;
  } else {
    region = await prisma.region.findUnique({ where: { id: data.regionId }, select: regionSelect });
    if (!region) throw new Response("Region tidak ditemukan.", { status: 404 });
  }

  await prisma.region.update({
    where: { id: data.regionId },
    data: { safetyTimeoutMin: min, safetyTimeoutMax: max, updatedById: session.id },
  });

  try {
    await updateRegionSettings({
      regionName: region.name,
      dryMaxPercent: region.dryMaxPercent,
      wetMinPercent: region.wetMinPercent,
      automaticMode: region.automaticMode,
      safetyTimeoutMin: min,
      safetyTimeoutMax: max,
    });
    await persistRegionSyncStatus(data.regionId, SyncStatus.SYNCED);
  } catch (error) {
    console.error("[firebase] updateRegionSettings", error);
    await persistRegionSyncStatus(data.regionId, SyncStatus.FAILED);
  }

  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.UPDATE,
    entityType: "RegionSafetyTimeout",
    entityId: data.regionId,
    metadata: { min, max },
  });

  return { ok: true };
}
