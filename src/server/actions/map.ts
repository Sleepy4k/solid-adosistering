"use server";

import { ActivityAction, Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { normalizePolygonPoints } from "~/lib/shared/polygon";
import type { BlockCreateResult, MapPoint, MapConfig, MapDisplayConfig, MapWorkspace } from "~/types/map";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../auth/security";
import { getSession } from "../auth/session";
import { decimalToString, logActivity, pointsToPolygonGeojson } from "../domain";
import { blockGeometrySchema, mapConfigSchema, mapDisplaySchema, parseInput } from "../validation";
import { createBlock } from "./blocks";

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
          select: { id: true, name: true, polygonGeojson: true, areaHectare: true, firebaseSyncStatus: true },
        },
      },
    }),
  ]);

  return {
    ...config,
    regions: regions.map((region) => ({
      id: region.id,
      name: region.name,
      latitude: region.latitude === null ? null : Number(region.latitude),
      longitude: region.longitude === null ? null : Number(region.longitude),
      blocks: region.blocks.map((block) => ({
        id: block.id,
        name: block.name,
        polygonGeojson: block.polygonGeojson,
        areaHectare: decimalToString(block.areaHectare),
        firebaseSyncStatus: block.firebaseSyncStatus,
      })),
    })),
  };
}

/**
 * Block creation entry point for the map configuration screen. The caller must
 * be a superadmin; createBlock performs the actual validation, scoping,
 * Firebase provisioning, and the single audit row.
 */
export async function createBlockFromMap(input: {
  regionId: string;
  name: string;
  areaHectare?: string | null;
}): Promise<BlockCreateResult> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  return createBlock(input);
}

export async function saveMapConfig(input: MapConfig) {
  const data = parseInput(mapConfigSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "mapConfig" },
    create: { key: "mapConfig", value: data },
    update: { value: data },
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
  const data = parseInput(mapDisplaySchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "mapDisplayConfig" },
    create: { key: "mapDisplayConfig", value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
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
  const actor = assertSuperadmin(session);

  const data = parseInput(blockGeometrySchema, input);
  const points = normalizePolygonPoints(data.points);
  const geojson = pointsToPolygonGeojson(points);

  let block: { id: string; regionId: string };
  try {
    block = await prisma.block.update({
      where: { id: data.blockId },
      data: { polygonGeojson: geojson ?? Prisma.JsonNull, updatedById: actor.id },
      select: { id: true, regionId: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Response("Block tidak ditemukan.", { status: 404 });
    }
    throw error;
  }

  await logActivity({
    actorId: actor.id,
    regionId: block.regionId,
    action: ActivityAction.UPDATE,
    entityType: "BlockMapGeometry",
    entityId: block.id,
    metadata: { pointCount: points.length },
  }).catch((error: unknown) => console.error("[map] failed to record block geometry audit", error));

  return { ok: true };
}
