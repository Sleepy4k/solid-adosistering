import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

/**
 * Region rows for the region management page and its export, with block,
 * admin, and active-sprayer counts. Callers enforce the SUPERADMIN check.
 */
export async function loadRegionList(where: Prisma.RegionWhereInput = {}) {
  const regions = await prisma.region.findMany({
    where,
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
