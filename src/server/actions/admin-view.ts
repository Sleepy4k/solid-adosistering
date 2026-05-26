"use server";

import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertAdminOrHigher } from "../security";
import { getSession } from "../session";
import { getScopedRegionIds, getRegionThresholdMap } from "./_helpers";
import type { DashboardRegion } from "~/types/dashboard";

export async function getUserDashboardView(userId: string): Promise<{ regions: DashboardRegion[] }> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  if (!userId || userId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new Response("User ID tidak valid.", { status: 400 });
  }

  let scopedRegionIds: string[] | null = null;
  const target = await prisma.user.findUnique({
    where: { id: userId, role: "USER" },
    select: { id: true },
  });
  if (!target) throw new Response("User tidak ditemukan.", { status: 404 });

  if (session.role === "ADMIN") {
    scopedRegionIds = await getScopedRegionIds(session);
    const userAssignment = await prisma.userRegionAssignment.findFirst({
      where: { userId, ...(scopedRegionIds ? { regionId: { in: scopedRegionIds } } : {}) },
    });
    if (!userAssignment) throw new Response("User berada di luar hak akses admin.", { status: 403 });
  }

  const assignments = await prisma.userRegionAssignment.findMany({
    where: { userId, ...(scopedRegionIds ? { regionId: { in: scopedRegionIds } } : {}) },
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
    userId,
    assignments.map((a) => a.regionId),
  );

  return {
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
          sprayers: block.sprayers.map((sprayer) => ({
            id: sprayer.id,
            hardwareId: sprayer.hardwareId,
            displayName: sprayer.displayName,
          })),
        })),
      };
    }),
  };
}
