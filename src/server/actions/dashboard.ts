"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import { getScopedRegionIds, getRegionThresholdMap, refreshFirebaseCache } from "./_helpers";
import type { DashboardRegion, AdminUserCard, SuperadminSummary } from "~/types/dashboard";

export type { DashboardRegion, AdminUserCard, SuperadminSummary };

export async function getMyDashboard(): Promise<
  | { type: "superadmin"; summary: SuperadminSummary }
  | { type: "user"; regions: DashboardRegion[] }
  | { type: "admin"; users: AdminUserCard[]; regions: DashboardRegion[] }
> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  await refreshFirebaseCache();

  if (session.role === "SUPERADMIN") {
    const [totalRegions, totalBlocks, totalAdmins, totalUsers, regions] = await Promise.all([
      prisma.region.count(),
      prisma.block.count(),
      prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
      prisma.user.count({ where: { role: "USER", isActive: true } }),
      prisma.region.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          latitude: true,
          longitude: true,
          firebaseSyncStatus: true,
          _count: { select: { blocks: true, adminAssignments: true } },
        },
      }),
    ]);
    return {
      type: "superadmin",
      summary: {
        totalRegions,
        totalBlocks,
        totalAdmins,
        totalUsers,
        regions: regions.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          latitude: r.latitude ? Number(r.latitude) : null,
          longitude: r.longitude ? Number(r.longitude) : null,
          blockCount: r._count.blocks,
          adminCount: r._count.adminAssignments,
          syncStatus: r.firebaseSyncStatus,
        })),
      },
    };
  }

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
    const thresholdMap = await getRegionThresholdMap(
      session.id,
      assignments.map((a) => a.regionId),
    );

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
            })),
          })),
        };
      }),
    };
  }

  const adminRegionIds = session.role === "ADMIN" ? await getScopedRegionIds(session) : null;
  if (adminRegionIds && adminRegionIds.length === 0) return { type: "admin", users: [], regions: [] };

  const adminRegions = await prisma.region.findMany({
    where: adminRegionIds ? { id: { in: adminRegionIds } } : undefined,
    orderBy: { name: "asc" },
    include: {
      blocks: {
        orderBy: { name: "asc" },
        include: { sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
      },
    },
  });

  const users = await prisma.user.findMany({
    where: {
      role: "USER",
      ...(adminRegionIds ? { assignedRegions: { some: { regionId: { in: adminRegionIds } } } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      profile: { select: { city: true, domicile: true } },
      assignedRegions: {
        include: {
          region: {
            select: {
              id: true,
              name: true,
              volumeDivider: true,
              blocks: {
                orderBy: { name: "asc" },
                include: { sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
              },
            },
          },
        },
      },
    },
  });

  const userIds = users.map((u) => u.id);
  const assignedRegionIds = [...new Set(users.flatMap((u) => u.assignedRegions.map((a) => a.regionId)))];
  const allThresholds =
    userIds.length > 0
      ? await prisma.indicatorThreshold.findMany({
          where: { userId: { in: userIds }, regionId: { in: assignedRegionIds } },
          select: {
            userId: true,
            regionId: true,
            dryMaxPercent: true,
            wetMinPercent: true,
            displayDryMaxPercent: true,
            displayMoistMaxPercent: true,
            displayWetMinPercent: true,
          },
        })
      : [];
  const thresholdMap = new Map(allThresholds.map((t) => [`${t.userId}:${t.regionId}`, t]));

  return {
    type: "admin",
    regions: adminRegions.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: r.latitude ? Number(r.latitude) : null,
      longitude: r.longitude ? Number(r.longitude) : null,
      volumeDivider: Number(r.volumeDivider ?? 1),
      showWindDirection: r.showWindDirection,
      showAutoIrrigation: r.showAutoIrrigation,
      threshold: null,
      blocks: r.blocks.map((block) => ({
        id: block.id,
        name: block.name,
        polygonGeojson: block.polygonGeojson,
        sprayers: block.sprayers.map((s) => ({ id: s.id, hardwareId: s.hardwareId, displayName: s.displayName })),
      })),
    })),
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      city: u.profile?.city ?? null,
      domicile: u.profile?.domicile ?? null,
      regions: u.assignedRegions.map((a) => ({ id: a.region.id, name: a.region.name })),
      sprayersByBlock: u.assignedRegions.flatMap((a) =>
        a.region.blocks.flatMap((block) =>
          block.sprayers.map((sprayer) => ({
            regionName: a.region.name,
            blockName: block.name,
            hardwareId: sprayer.hardwareId,
            sprayerId: sprayer.id,
            volumeDivider: Number(a.region.volumeDivider ?? 1),
            threshold: thresholdMap.get(`${u.id}:${a.regionId}`) ?? null,
          })),
        ),
      ),
    })),
  };
}
