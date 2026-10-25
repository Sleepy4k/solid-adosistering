"use server";

import { MoistureStatus, type Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import {
  getScopedRegionIds,
  getRegionThresholdMap,
  displayThresholdDefaults,
  refreshFirebaseWithin,
  scheduleFirebaseRefresh,
} from "../domain";
import { getDataStampBySprayer } from "../domain/dataStamp";
import { assertAdminOrHigher, assertSuperadmin } from "../auth/security";
import { pageWindow, regionOrderBy, regionSearchWhere } from "../domain/regionList";
import { adminUserQuerySchema, regionSummaryQuerySchema } from "../validation/regionLists";
import { parseInput } from "../validation";
import {
  ADMIN_USER_SORT_KEYS,
  REGION_SUMMARY_SORT_KEYS,
  type AdminAccountFilter,
  type AdminUserSortKey,
  type Paged,
  type PagedQuery,
  type RegionSummarySortKey,
} from "~/lib/shared/regionTable";
import { resolveSort } from "~/lib/shared/tableSort";
import type {
  DashboardRegion,
  AdminUserCard,
  AdminDashboardStats,
  SuperadminRegionRow,
  SuperadminSummary,
} from "~/types/dashboard";

export type { DashboardRegion, AdminUserCard, AdminDashboardStats, SuperadminRegionRow, SuperadminSummary };

const MAP_MARKER_LIMIT = 1000;

const HAS_ACTIVE_SPRAYER = { blocks: { some: { sprayers: { some: { isActive: true } } } } } as const;

export async function getMyDashboard(): Promise<
  | { type: "superadmin"; summary: SuperadminSummary }
  | { type: "user"; regions: DashboardRegion[] }
  | { type: "admin"; regions: DashboardRegion[]; stats: AdminDashboardStats }
> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  if (session.role === "SUPERADMIN") {
    scheduleFirebaseRefresh();
    const [totalRegions, totalBlocks, totalAdmins, totalUsers, markers] = await Promise.all([
      prisma.region.count(),
      prisma.block.count(),
      prisma.user.count({ where: { role: "ADMIN", isActive: true, deletedAt: null } }),
      prisma.user.count({ where: { role: "USER", isActive: true, deletedAt: null } }),
      // The map needs every plotted region, so it gets a lean, capped query;
      // the region table is paged server-side via getSuperadminRegions.
      prisma.region.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: MAP_MARKER_LIMIT,
        select: { id: true, name: true, latitude: true, longitude: true },
      }),
    ]);
    return {
      type: "superadmin",
      summary: {
        totalRegions,
        totalBlocks,
        totalAdmins,
        totalUsers,
        markers: markers.map((r) => ({
          id: r.id,
          name: r.name,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
        })),
      },
    };
  }

  // The sprayer cards show the stored "latest data update", so give a due
  // refresh a short, bounded chance to land before it is read.
  await refreshFirebaseWithin();

  if (session.role === "USER") {
    const assignments = await prisma.userRegionAssignment.findMany({
      where: { userId: session.id },
      include: {
        region: {
          include: {
            blocks: {
              orderBy: { name: "asc" },
              include: { sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
            },
          },
        },
      },
    });
    const assignedSprayerIds = assignments.flatMap((a) =>
      a.region.blocks.flatMap((block) => block.sprayers.map((sprayer) => sprayer.id)),
    );
    const [thresholdMap, dataStampMap] = await Promise.all([
      getRegionThresholdMap(
        session.id,
        assignments.map((a) => a.regionId),
      ),
      getDataStampBySprayer(assignedSprayerIds),
    ]);

    return {
      type: "user",
      regions: assignments.map((a) => {
        const region = a.region;
        const threshold = thresholdMap.get(region.id) ?? null;
        return {
          id: region.id,
          name: region.name,
          description: region.description,
          latitude: region.latitude ? Number(region.latitude) : null,
          longitude: region.longitude ? Number(region.longitude) : null,
          volumeDivider: Number(region.volumeDivider ?? 1),
          showWindDirection: region.showWindDirection,
          showAutoIrrigation: region.showAutoIrrigation,
          threshold: threshold
            ? {
                dryMaxPercent: threshold.dryMaxPercent,
                wetMinPercent: threshold.wetMinPercent,
                displayDryMaxPercent: threshold.displayDryMaxPercent,
                displayMoistMaxPercent: threshold.displayMoistMaxPercent,
                displayWetMinPercent: threshold.displayWetMinPercent,
                landPreference: threshold.landPreference,
              }
            : null,
          blocks: region.blocks.map((block) => ({
            id: block.id,
            name: block.name,
            polygonGeojson: block.polygonGeojson,
            sprayers: block.sprayers.map((s) => ({
              id: s.id,
              hardwareId: s.hardwareId,
              displayName: s.displayName,
              lastDataAt: dataStampMap.get(s.id) ?? null,
            })),
          })),
        };
      }),
    };
  }

  const adminRegionIds = session.role === "ADMIN" ? await getScopedRegionIds(session) : null;
  const emptyStats: AdminDashboardStats = { totalUsers: 0, activeUsers: 0, attentionUsers: 0, sprayerCount: 0 };
  if (adminRegionIds && adminRegionIds.length === 0) return { type: "admin", regions: [], stats: emptyStats };

  const userScope = adminUserScope(adminRegionIds);
  const [adminRegions, totalUsers, activeUsers, attentionUsers, sprayerCount] = await Promise.all([
    prisma.region.findMany({
      where: adminRegionIds ? { id: { in: adminRegionIds } } : undefined,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        blocks: {
          orderBy: { name: "asc" },
          include: { sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    prisma.user.count({ where: userScope }),
    prisma.user.count({ where: { AND: [userScope, { isActive: true }] } }),
    prisma.user.count({ where: { AND: [userScope, accountWhere("attention", adminRegionIds)] } }),
    // Installed sprayers are physical units per region/block; counting user
    // assignments would double-count a sprayer shared across users.
    prisma.sprayer.count({
      where: { isActive: true, ...(adminRegionIds ? { block: { regionId: { in: adminRegionIds } } } : {}) },
    }),
  ]);
  const adminSprayerIds = adminRegions.flatMap((region) =>
    region.blocks.flatMap((block) => block.sprayers.map((sprayer) => sprayer.id)),
  );
  const dataStampMap = await getDataStampBySprayer(adminSprayerIds);
  const defaultDisplay = displayThresholdDefaults();

  return {
    type: "admin",
    stats: { totalUsers, activeUsers, attentionUsers, sprayerCount },
    regions: adminRegions.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: r.latitude ? Number(r.latitude) : null,
      longitude: r.longitude ? Number(r.longitude) : null,
      volumeDivider: Number(r.volumeDivider ?? 1),
      showWindDirection: r.showWindDirection,
      showAutoIrrigation: r.showAutoIrrigation,
      threshold: {
        dryMaxPercent: r.dryMaxPercent,
        wetMinPercent: r.wetMinPercent,
        ...defaultDisplay,
        landPreference: MoistureStatus.LEMBAB,
      },
      blocks: r.blocks.map((block) => ({
        id: block.id,
        name: block.name,
        polygonGeojson: block.polygonGeojson,
        sprayers: block.sprayers.map((s) => ({
          id: s.id,
          hardwareId: s.hardwareId,
          displayName: s.displayName,
          lastDataAt: dataStampMap.get(s.id) ?? null,
        })),
      })),
    })),
  };
}

/** USER accounts visible to the actor: in scope for an ADMIN, all for a SUPERADMIN. */
function adminUserScope(adminRegionIds: string[] | null): Prisma.UserWhereInput {
  return {
    role: "USER",
    deletedAt: null,
    ...(adminRegionIds ? { assignedRegions: { some: { regionId: { in: adminRegionIds } } } } : {}),
  };
}

function accountWhere(account: AdminAccountFilter, adminRegionIds: string[] | null): Prisma.UserWhereInput {
  if (account === "active") return { isActive: true };
  if (account === "inactive") return { isActive: false };
  const hasSprayers: Prisma.UserWhereInput = {
    assignedRegions: {
      some: {
        ...(adminRegionIds ? { regionId: { in: adminRegionIds } } : {}),
        region: HAS_ACTIVE_SPRAYER,
      },
    },
  };
  return { OR: [{ isActive: false }, { NOT: hasSprayers }] };
}

export type SuperadminRegionQuery = PagedQuery<RegionSummarySortKey> & {
  syncStatus?: "SYNCED" | "PENDING" | "FAILED";
};

/** Server-side searched, filtered, sorted, paged region summary for the superadmin dashboard. */
export async function getSuperadminRegions(input: SuperadminRegionQuery = {}): Promise<Paged<SuperadminRegionRow>> {
  const query = parseInput(regionSummaryQuerySchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const sort = resolveSort(REGION_SUMMARY_SORT_KEYS, query.sort, { key: "name", dir: "asc" });
  const and: Prisma.RegionWhereInput[] = [];
  const search = regionSearchWhere(query.search);
  if (search) and.push(search);
  if (query.syncStatus) and.push({ firebaseSyncStatus: query.syncStatus });
  const where: Prisma.RegionWhereInput = and.length > 0 ? { AND: and } : {};
  const { take, skip } = pageWindow(query);

  const [total, rows] = await Promise.all([
    prisma.region.count({ where }),
    prisma.region.findMany({
      where,
      orderBy: regionOrderBy(sort),
      take,
      skip,
      select: {
        id: true,
        name: true,
        description: true,
        firebaseSyncStatus: true,
        _count: { select: { blocks: true, adminAssignments: true } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      blockCount: r._count.blocks,
      adminCount: r._count.adminAssignments,
      syncStatus: r.firebaseSyncStatus,
    })),
  };
}

export type AdminUsersQuery = PagedQuery<AdminUserSortKey> & {
  regionId?: string;
  account?: AdminAccountFilter;
};

function adminUserOrderBy(sort: { key: AdminUserSortKey; dir: "asc" | "desc" }): Prisma.UserOrderByWithRelationInput[] {
  const dir = sort.dir;
  const primary: Prisma.UserOrderByWithRelationInput =
    sort.key === "email"
      ? { email: dir }
      : sort.key === "city"
        ? { profile: { city: dir } }
        : sort.key === "isActive"
          ? { isActive: dir }
          : sort.key === "createdAt"
            ? { createdAt: dir }
            : { name: dir };
  return [primary, { id: "asc" }];
}

/**
 * One server-side page of user cards for the admin dashboard. Search, region
 * and account filters, sorting, and paging all run in the database; sprayer
 * trees and data stamps are only loaded for the users on the returned page.
 */
export async function getAdminUsers(input: AdminUsersQuery = {}): Promise<Paged<AdminUserCard>> {
  const query = parseInput(adminUserQuerySchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const adminRegionIds = session.role === "ADMIN" ? await getScopedRegionIds(session) : null;
  if (adminRegionIds && adminRegionIds.length === 0) return { items: [], total: 0 };
  // A region outside the actor's scope can never match.
  if (query.regionId && adminRegionIds && !adminRegionIds.includes(query.regionId)) return { items: [], total: 0 };

  const sort = resolveSort(ADMIN_USER_SORT_KEYS, query.sort, { key: "name", dir: "asc" });
  const and: Prisma.UserWhereInput[] = [adminUserScope(adminRegionIds)];
  if (query.regionId) and.push({ assignedRegions: { some: { regionId: query.regionId } } });
  if (query.account) and.push(accountWhere(query.account, adminRegionIds));
  const term = query.search?.trim();
  const regionScope: Prisma.UserRegionAssignmentWhereInput = adminRegionIds ? { regionId: { in: adminRegionIds } } : {};
  if (term) {
    and.push({
      OR: [
        { name: { contains: term } },
        { email: { contains: term } },
        { profile: { is: { city: { contains: term } } } },
        { profile: { is: { domicile: { contains: term } } } },
        // Region and device matches only count inside the admin's own regions,
        // otherwise a search could confirm names/ids of regions they cannot see.
        { assignedRegions: { some: { ...regionScope, region: { name: { contains: term } } } } },
        {
          assignedRegions: {
            some: {
              ...regionScope,
              region: { blocks: { some: { sprayers: { some: { hardwareId: { contains: term } } } } } },
            },
          },
        },
      ],
    });
  }
  const where: Prisma.UserWhereInput = { AND: and };
  const { take, skip } = pageWindow(query);

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: adminUserOrderBy(sort),
      take,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        profile: { select: { city: true, domicile: true } },
        assignedRegions: {
          select: {
            regionId: true,
            region: {
              select: { id: true, name: true, volumeDivider: true, dryMaxPercent: true, wetMinPercent: true },
            },
          },
        },
      },
    }),
  ]);
  if (users.length === 0) return { items: [], total };

  const userIds = users.map((u) => u.id);
  const pageRegionIds = [
    ...new Set(
      users.flatMap((u) =>
        u.assignedRegions.map((a) => a.regionId).filter((id) => !adminRegionIds || adminRegionIds.includes(id)),
      ),
    ),
  ];
  const [blocks, thresholds] = await Promise.all([
    prisma.block.findMany({
      where: { regionId: { in: pageRegionIds } },
      orderBy: { name: "asc" },
      select: {
        regionId: true,
        name: true,
        sprayers: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, hardwareId: true },
        },
      },
    }),
    prisma.indicatorThreshold.findMany({
      where: { userId: { in: userIds }, regionId: { in: pageRegionIds } },
      select: {
        userId: true,
        regionId: true,
        displayDryMaxPercent: true,
        displayMoistMaxPercent: true,
        displayWetMinPercent: true,
      },
    }),
  ]);
  const dataStampMap = await getDataStampBySprayer(blocks.flatMap((b) => b.sprayers.map((s) => s.id)));
  const blocksByRegion = new Map<string, typeof blocks>();
  for (const block of blocks) {
    const list = blocksByRegion.get(block.regionId) ?? [];
    list.push(block);
    blocksByRegion.set(block.regionId, list);
  }
  const thresholdMap = new Map(thresholds.map((t) => [`${t.userId}:${t.regionId}`, t]));

  return {
    total,
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      city: u.profile?.city ?? null,
      domicile: u.profile?.domicile ?? null,
      regions: u.assignedRegions.map((a) => ({ id: a.region.id, name: a.region.name })),
      sprayersByBlock: u.assignedRegions.flatMap((a) => {
        const display = displayThresholdDefaults(thresholdMap.get(`${u.id}:${a.regionId}`));
        return (blocksByRegion.get(a.regionId) ?? []).flatMap((block) =>
          block.sprayers.map((sprayer) => ({
            regionName: a.region.name,
            blockName: block.name,
            hardwareId: sprayer.hardwareId,
            sprayerId: sprayer.id,
            lastDataAt: dataStampMap.get(sprayer.id) ?? null,
            volumeDivider: Number(a.region.volumeDivider ?? 1),
            threshold: {
              dryMaxPercent: a.region.dryMaxPercent,
              wetMinPercent: a.region.wetMinPercent,
              ...display,
            },
          })),
        );
      }),
    })),
  };
}
