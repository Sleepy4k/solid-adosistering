"use server";

import { ActivityAction, Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";
import { logActivity, pointsToPolygonGeojson } from "./_helpers";
import type { MapPoint, MapConfig, MapDisplayConfig, MapWorkspace } from "~/types/map";

export type { MapPoint, MapConfig, MapDisplayConfig, MapWorkspace };

export async function getMapConfig(): Promise<MapConfig> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const setting = await prisma.systemSetting.findUnique({ where: { key: "mapConfig" } });
  return (setting?.value as MapConfig | null) ?? { lat: -6.9175, lng: 107.6191, zoom: 12 };
}

export async function getMapWorkspace(): Promise<MapWorkspace> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const [config, regions] = await Promise.all([
    getMapConfig(),
    prisma.region.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        blocks: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, polygonGeojson: true },
        },
      },
    }),
  ]);

  return {
    ...config,
    regions: regions.map((region) => ({
      id: region.id,
      name: region.name,
      latitude: region.latitude ? Number(region.latitude) : null,
      longitude: region.longitude ? Number(region.longitude) : null,
      blocks: region.blocks,
    })),
  };
}

export async function saveMapConfig(input: MapConfig) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "mapConfig" },
    create: { key: "mapConfig", value: input },
    update: { value: input },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "mapConfig",
  });
  return { ok: true };
}

export async function getMapDisplayConfig(): Promise<MapDisplayConfig> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const defaults: MapDisplayConfig = { basahColor: "#3b82f6", keringColor: "#ef4444", lembabColor: "#facc15" };
  const setting = await prisma.systemSetting.findUnique({ where: { key: "mapDisplayConfig" } });
  if (!setting?.value) return defaults;
  return { ...defaults, ...(setting.value as Partial<MapDisplayConfig>) };
}

export async function saveMapDisplayConfig(input: MapDisplayConfig) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "mapDisplayConfig" },
    create: { key: "mapDisplayConfig", value: input as unknown as Prisma.InputJsonValue },
    update: { value: input as unknown as Prisma.InputJsonValue },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "mapDisplayConfig",
  });
  return { ok: true };
}

export async function saveBlockMapGeometry(input: { blockId: string; points: MapPoint[] }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const geojson = pointsToPolygonGeojson(input.points);
  const block = await prisma.block.update({
    where: { id: input.blockId },
    data: { polygonGeojson: geojson ?? Prisma.JsonNull },
    select: { id: true, regionId: true },
  });

  await logActivity({
    actorId: session.id,
    regionId: block.regionId,
    blockId: block.id,
    action: ActivityAction.UPDATE,
    entityType: "BlockMapGeometry",
    entityId: block.id,
    metadata: { pointCount: input.points.length },
  });
  return { ok: true };
}
