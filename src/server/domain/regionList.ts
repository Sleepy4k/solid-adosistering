import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { SortDir } from "~/lib/shared/tableSort";

export const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 10;

/** Clamp client paging input: limit in 1..100, offset >= 0. */
export function pageWindow(input: { limit?: number | undefined; offset?: number | undefined }) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_LIMIT), 1), MAX_PAGE_LIMIT);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  return { take: limit, skip: offset };
}

/**
 * Allow-listed `orderBy` for region tables. The key is already validated by
 * `resolveSort`; the unknown-key branch only exists to keep the switch total.
 * A unique `id` tiebreaker is always appended so pages are stable.
 */
export function regionOrderBy(sort: { key: string; dir: SortDir }): Prisma.RegionOrderByWithRelationInput[] {
  const dir = sort.dir;
  let primary: Prisma.RegionOrderByWithRelationInput;
  switch (sort.key) {
    case "description":
      primary = { description: dir };
      break;
    case "blocks":
      primary = { blocks: { _count: dir } };
      break;
    case "admins":
      primary = { adminAssignments: { _count: dir } };
      break;
    case "automaticMode":
      primary = { automaticMode: dir };
      break;
    case "firebaseSyncStatus":
      primary = { firebaseSyncStatus: dir };
      break;
    case "createdAt":
      primary = { createdAt: dir };
      break;
    case "volumeDivider":
      primary = { volumeDivider: dir };
      break;
    case "showWindDirection":
      primary = { showWindDirection: dir };
      break;
    case "showAutoIrrigation":
      primary = { showAutoIrrigation: dir };
      break;
    default:
      primary = { name: dir };
  }
  return [primary, { id: "asc" }];
}

const regionListSelect = {
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
} satisfies Prisma.RegionSelect;

type RegionListRecord = Prisma.RegionGetPayload<{ select: typeof regionListSelect }>;

async function hydrateRegionRows(regions: RegionListRecord[]) {
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

/**
 * All region rows (used by the export), with block, admin, and active-sprayer
 * counts. Callers enforce the SUPERADMIN check.
 */
export async function loadRegionList(where: Prisma.RegionWhereInput = {}) {
  const regions = await prisma.region.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: regionListSelect,
  });
  return hydrateRegionRows(regions);
}

/** One server-side page of region rows plus the filtered total. */
export async function loadRegionPage(options: {
  where: Prisma.RegionWhereInput;
  orderBy: Prisma.RegionOrderByWithRelationInput[];
  take: number;
  skip: number;
}) {
  const [total, regions] = await Promise.all([
    prisma.region.count({ where: options.where }),
    prisma.region.findMany({
      where: options.where,
      orderBy: options.orderBy,
      take: options.take,
      skip: options.skip,
      select: regionListSelect,
    }),
  ]);
  return { items: await hydrateRegionRows(regions), total };
}

/** Free-text search over region name and description (null when blank). */
export function regionSearchWhere(search: string | undefined): Prisma.RegionWhereInput | null {
  const term = search?.trim();
  if (!term) return null;
  return { OR: [{ name: { contains: term } }, { description: { contains: term } }] };
}
