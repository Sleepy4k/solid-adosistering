"use server";

import type { Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import { getScopedBlockIds, getScopedRegionIds, refreshFirebaseCache } from "./_helpers";

export async function getStatistics(input: { blockId?: string; regionId?: string; range: "today" | "7d" | "30d" }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  await refreshFirebaseCache();

  const now = new Date();
  let since: Date;
  if (input.range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (input.range === "7d") {
    since = new Date(Date.now() - 7 * 86400_000);
  } else {
    since = new Date(Date.now() - 30 * 86400_000);
  }

  let scopedBlockIds: string[] | null = null;
  if (input.blockId || input.regionId || session.role !== "SUPERADMIN") {
    if (input.regionId && !input.blockId) {
      const scopedRegionIds = await getScopedRegionIds(session);
      const allowed = scopedRegionIds ? scopedRegionIds.includes(input.regionId) : true;
      if (!allowed) {
        scopedBlockIds = [];
      } else {
        const blocks = await prisma.block.findMany({ where: { regionId: input.regionId }, select: { id: true } });
        scopedBlockIds = blocks.map((b) => b.id);
      }
    } else {
      scopedBlockIds = await getScopedBlockIds(session, input.blockId);
      if (input.regionId) {
        const regionBlocks = new Set(
          (await prisma.block.findMany({ where: { regionId: input.regionId }, select: { id: true } })).map((b) => b.id),
        );
        scopedBlockIds = scopedBlockIds.filter((id) => regionBlocks.has(id));
      }
    }
  }

  const blockFilter: Prisma.SensorReadingWhereInput = scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};
  const eventFilter: Prisma.IrrigationEventWhereInput = scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};

  const readings = await prisma.sensorReading.findMany({
    where: { ...blockFilter, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: {
      recordedAt: true,
      moisturePercent: true,
      flowLmin: true,
      totalVolumeLiter: true,
      moistureStatus: true,
      block: { select: { id: true, name: true, region: { select: { name: true, volumeDivider: true } } } },
    },
    take: 2000,
  });

  const events = await prisma.irrigationEvent.findMany({
    where: { ...eventFilter, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    select: { mode: true, relay: true, startedAt: true, endedAt: true, blockId: true },
  });

  return {
    readings: readings.map((r) => {
      const volumeDivider = Number(r.block.region.volumeDivider ?? 1);
      return {
        recordedAt: r.recordedAt.toISOString(),
        moisturePercent: Number(r.moisturePercent),
        flowLmin: Number(r.flowLmin) / volumeDivider,
        totalVolumeLiter: r.totalVolumeLiter === null ? null : Number(r.totalVolumeLiter) / volumeDivider,
        moistureStatus: r.moistureStatus,
        block: { id: r.block.id, name: r.block.name, region: { name: r.block.region.name } },
      };
    }),
    events: events.map((e) => ({
      ...e,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
    })),
    since: since.toISOString(),
  };
}
