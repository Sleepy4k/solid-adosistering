"use server";

import { ActivityAction, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { firebaseSegment } from "~/lib/shared/irrigation";
import { prisma } from "../db/prisma";
import { firebaseAdminDb } from "../services/firebaseAdmin";
import { provisionRegionNode, renameRegionNode } from "../services/firebaseSync";
import { assertSuperadmin, type SessionUser } from "../security";
import { getSession } from "../session";
import { decimalCoordinate, getScopedRegionIds, logActivity, type CoordinateInput } from "./_helpers";

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
      createdAt: true,
      _count: { select: { blocks: true, adminAssignments: true } },
      adminAssignments: {
        select: { admin: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return regions.map((region) => ({
    id: region.id,
    name: region.name,
    description: region.description,
    latitude: region.latitude === null ? null : Number(region.latitude),
    longitude: region.longitude === null ? null : Number(region.longitude),
    firebaseSyncStatus: region.firebaseSyncStatus,
    firebaseSyncedAt: region.firebaseSyncedAt?.toISOString() ?? null,
    createdAt: region.createdAt.toISOString(),
    _count: region._count,
    adminAssignments: region.adminAssignments,
  }));
}

export async function createRegion(input: {
  actor?: SessionUser;
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const session = await getSession();
  const actor = assertSuperadmin(input.actor ?? session);
  const region = await prisma.region.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim(),
      latitude: decimalCoordinate(input.latitude, "Latitude"),
      longitude: decimalCoordinate(input.longitude, "Longitude"),
      createdById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionRegionNode(region);
    const synced = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
    await logActivity({
      actorId: actor.id,
      regionId: region.id,
      action: ActivityAction.CREATE,
      entityType: "Region",
      entityId: region.id,
    });
    return synced;
  } catch {
    const failed = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.FAILED },
    });
    await logActivity({
      actorId: actor.id,
      regionId: region.id,
      action: ActivityAction.CREATE,
      entityType: "Region",
      entityId: region.id,
    }).catch(() => undefined);
    return failed;
  }
}

export async function updateRegion(input: {
  actor?: SessionUser;
  id: string;
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const session = await getSession();
  const actor = assertSuperadmin(input.actor ?? session);
  const existing = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  const updated = await prisma.region.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim(),
      latitude: decimalCoordinate(input.latitude, "Latitude"),
      longitude: decimalCoordinate(input.longitude, "Longitude"),
      updatedById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await renameRegionNode(existing.name, updated);
    await logActivity({
      actorId: actor.id,
      regionId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Region",
      entityId: updated.id,
    });
    return prisma.region.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch {
    const failed = await prisma.region.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.FAILED },
    });
    await logActivity({
      actorId: actor.id,
      regionId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Region",
      entityId: updated.id,
    }).catch(() => undefined);
    return failed;
  }
}

export async function deleteRegion(input: { id: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  await prisma.region.delete({ where: { id: input.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "Region", entityId: input.id });

  try {
    await firebaseAdminDb().ref(firebaseSegment(region.name)).remove();
  } catch {}

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
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.upsert({
    where: { adminId_regionId: { adminId: input.adminId, regionId: input.regionId } },
    update: {},
    create: { adminId: input.adminId, regionId: input.regionId, assignedById: session.id },
  });
  await logActivity({
    actorId: session.id,
    regionId: input.regionId,
    action: ActivityAction.ASSIGN,
    entityType: "AdminRegion",
    entityId: input.adminId,
  });
  return { ok: true };
}

export async function removeAdminFromRegion(input: { adminId: string; regionId: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.deleteMany({
    where: { adminId: input.adminId, regionId: input.regionId },
  });
  await logActivity({
    actorId: session.id,
    regionId: input.regionId,
    action: ActivityAction.UNASSIGN,
    entityType: "AdminRegion",
    entityId: input.adminId,
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
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
  }));
}

export async function updateRegionConfig(input: {
  id: string;
  volumeDivider: number;
  showWindDirection: boolean;
  showAutoIrrigation: boolean;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  if (!Number.isFinite(input.volumeDivider) || input.volumeDivider <= 0) {
    throw new Response("Volume divider harus berupa angka positif.", { status: 400 });
  }

  await prisma.region.update({
    where: { id: input.id },
    data: {
      volumeDivider: input.volumeDivider,
      showWindDirection: input.showWindDirection,
      showAutoIrrigation: input.showAutoIrrigation,
      updatedById: session.id,
    },
  });
  await logActivity({
    actorId: session.id,
    regionId: input.id,
    action: ActivityAction.UPDATE,
    entityType: "RegionConfig",
    entityId: input.id,
    metadata: {
      volumeDivider: input.volumeDivider,
      showWindDirection: input.showWindDirection,
      showAutoIrrigation: input.showAutoIrrigation,
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
