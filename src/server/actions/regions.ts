"use server";

import { ActivityAction, SyncStatus } from "@prisma/client";
import type { Region } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { firebaseSegment } from "~/lib/shared/irrigation";
import { prisma } from "../db/prisma";
import { firebaseAdminDb, provisionRegionNode, renameRegionNode } from "../integrations/firebase";
import { assertSuperadmin } from "../auth/security";
import { getSession } from "../auth/session";
import { decimalCoordinate, getScopedRegionIds, logActivity, type CoordinateInput } from "../domain";
import {
  assignAdminSchema,
  createRegionSchema,
  idInputSchema,
  parseInput,
  updateRegionConfigSchema,
  updateRegionSchema,
} from "../validation";

export async function getRegions() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const regions = await prisma.region.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      latitude: true,
      longitude: true,
      firebaseSyncStatus: true,
      firebaseSyncedAt: true,
      automaticMode: true,
      createdAt: true,
      _count: { select: { blocks: true, adminAssignments: true } },
      adminAssignments: {
        select: { admin: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const blockCounts = await prisma.block.findMany({
    where: { regionId: { in: regions.map((region) => region.id) } },
    select: {
      regionId: true,
      _count: { select: { sprayers: { where: { isActive: true } } } },
    },
  });
  const sprayerCountByRegion = new Map<string, number>();
  for (const block of blockCounts) {
    sprayerCountByRegion.set(block.regionId, (sprayerCountByRegion.get(block.regionId) ?? 0) + block._count.sprayers);
  }

  return regions.map((region) => ({
    id: region.id,
    name: region.name,
    description: region.description,
    latitude: region.latitude === null ? null : Number(region.latitude),
    longitude: region.longitude === null ? null : Number(region.longitude),
    firebaseSyncStatus: region.firebaseSyncStatus,
    firebaseSyncedAt: region.firebaseSyncedAt?.toISOString() ?? null,
    automaticMode: region.automaticMode,
    sprayerCount: sprayerCountByRegion.get(region.id) ?? 0,
    createdAt: region.createdAt.toISOString(),
    _count: region._count,
    adminAssignments: region.adminAssignments,
  }));
}

export async function createRegion(input: {
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const data = parseInput(createRegionSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertSuperadmin(session);
  const region = await prisma.region.create({
    data: {
      name: data.name,
      description: data.description,
      latitude: decimalCoordinate(data.latitude, "Latitude"),
      longitude: decimalCoordinate(data.longitude, "Longitude"),
      createdById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });

  // Firebase provisioning runs outside any database transaction, then the
  // sync status is persisted. The audit write runs after both paths so an
  // audit failure can neither flip a synced region to FAILED nor duplicate
  // the audit row.
  let regionAfterSync: Region;
  try {
    await provisionRegionNode({
      name: region.name,
      dryMaxPercent: region.dryMaxPercent,
      wetMinPercent: region.wetMinPercent,
      automaticMode: region.automaticMode,
      safetyTimeoutMin: region.safetyTimeoutMin,
      safetyTimeoutMax: region.safetyTimeoutMax,
    });
    regionAfterSync = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    console.error(`[firebase] provisionRegionNode failed (${region.name}):`, error);
    regionAfterSync = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.FAILED },
    });
  }

  await logActivity({
    actorId: actor.id,
    regionId: region.id,
    action: ActivityAction.CREATE,
    entityType: "Region",
    entityId: region.id,
  }).catch((error: unknown) => {
    console.error("[activity] createRegion audit failed:", error);
  });

  return regionAfterSync;
}

export async function updateRegion(input: {
  id: string;
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const data = parseInput(updateRegionSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertSuperadmin(session);
  const existing = await prisma.region.findUniqueOrThrow({ where: { id: data.id } });
  const nameChanged = existing.name !== data.name;
  const updated = await prisma.region.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description,
      latitude: decimalCoordinate(data.latitude, "Latitude"),
      longitude: decimalCoordinate(data.longitude, "Longitude"),
      updatedById: actor.id,
      ...(nameChanged ? { firebaseSyncStatus: SyncStatus.PENDING } : {}),
    },
  });

  // Description/coordinate-only edits are SQL-only: the Firebase node does not
  // change, so it must not be renamed or marked as a sync failure (F-01).
  if (!nameChanged) {
    await logActivity({
      actorId: actor.id,
      regionId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Region",
      entityId: updated.id,
    });
    return updated;
  }

  // Firebase rename runs outside any database transaction, then the sync
  // status is persisted. The audit write runs after both paths so an audit
  // failure can neither flip a synced region to FAILED nor duplicate the
  // audit row.
  let regionAfterSync: Region;
  try {
    await renameRegionNode(existing.name, {
      name: updated.name,
      dryMaxPercent: updated.dryMaxPercent,
      wetMinPercent: updated.wetMinPercent,
      automaticMode: updated.automaticMode,
      safetyTimeoutMin: updated.safetyTimeoutMin,
      safetyTimeoutMax: updated.safetyTimeoutMax,
    });
    regionAfterSync = await prisma.region.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    console.error(`[firebase] renameRegionNode failed (${updated.name}):`, error);
    regionAfterSync = await prisma.region.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.FAILED },
    });
  }

  await logActivity({
    actorId: actor.id,
    regionId: updated.id,
    action: ActivityAction.UPDATE,
    entityType: "Region",
    entityId: updated.id,
  }).catch((error: unknown) => {
    console.error("[activity] updateRegion audit failed:", error);
  });

  return regionAfterSync;
}

export async function deleteRegion(input: { id: string }) {
  const data = parseInput(idInputSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const region = await prisma.region.findUniqueOrThrow({ where: { id: data.id } });

  // Remove the RTDB node first: if the SQL row disappeared while the node
  // survived, reusing the region name could resurrect old blocks.
  try {
    await firebaseAdminDb().ref(firebaseSegment(region.name)).remove();
  } catch (error) {
    console.error(`[firebase] deleteRegion node removal failed (${region.name}):`, error);
    throw new Response("Gagal menghapus node Firebase region.", { status: 502 });
  }

  await prisma.region.delete({ where: { id: data.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "Region", entityId: data.id });

  return { ok: true };
}

export async function getAdmins() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  return prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function assignAdminToRegion(input: { adminId: string; regionId: string }) {
  const data = parseInput(assignAdminSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const [admin, region] = await Promise.all([
    prisma.user.findFirst({ where: { id: data.adminId, role: "ADMIN", isActive: true }, select: { id: true } }),
    prisma.region.findUnique({ where: { id: data.regionId }, select: { id: true } }),
  ]);
  if (!admin) throw new Response("Admin tidak ditemukan atau tidak aktif.", { status: 404 });
  if (!region) throw new Response("Region tidak ditemukan.", { status: 404 });

  await prisma.adminRegionAssignment.upsert({
    where: { adminId_regionId: { adminId: data.adminId, regionId: data.regionId } },
    update: {},
    create: { adminId: data.adminId, regionId: data.regionId, assignedById: session.id },
  });
  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.ASSIGN,
    entityType: "AdminRegion",
    entityId: data.adminId,
  });
  return { ok: true };
}

export async function removeAdminFromRegion(input: { adminId: string; regionId: string }) {
  const data = parseInput(assignAdminSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.deleteMany({
    where: { adminId: data.adminId, regionId: data.regionId },
  });
  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.UNASSIGN,
    entityType: "AdminRegion",
    entityId: data.adminId,
  });
  return { ok: true };
}

export async function getMyRegions() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const regionIds = await getScopedRegionIds(session);
  const rows = await prisma.region.findMany({
    where: regionIds ? { id: { in: regionIds } } : undefined,
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude === null ? null : Number(r.latitude),
    longitude: r.longitude === null ? null : Number(r.longitude),
  }));
}

export async function updateRegionConfig(input: {
  id: string;
  volumeDivider: number;
  showWindDirection: boolean;
  showAutoIrrigation: boolean;
}) {
  const data = parseInput(updateRegionConfigSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.region.update({
    where: { id: data.id },
    data: {
      volumeDivider: data.volumeDivider,
      showWindDirection: data.showWindDirection,
      showAutoIrrigation: data.showAutoIrrigation,
      updatedById: session.id,
    },
  });
  await logActivity({
    actorId: session.id,
    regionId: data.id,
    action: ActivityAction.UPDATE,
    entityType: "RegionConfig",
    entityId: data.id,
    metadata: {
      volumeDivider: data.volumeDivider,
      showWindDirection: data.showWindDirection,
      showAutoIrrigation: data.showAutoIrrigation,
    },
  });
  return { ok: true };
}

export async function getRegionsForConfig() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const rows = await prisma.region.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      volumeDivider: true,
      showWindDirection: true,
      showAutoIrrigation: true,
    },
  });
  return rows.map((r) => ({ ...r, volumeDivider: Number(r.volumeDivider) }));
}
