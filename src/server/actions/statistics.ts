"use server";

import type { Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { getScopedBlockIds, getScopedRegionIds, scheduleFirebaseRefresh } from "../domain";
import { parseInput, statisticsSchema } from "../validation";

export async function getStatistics(input: { blockId?: string; regionId?: string; range: "today" | "7d" | "30d" }) {
  const data = parseInput(statisticsSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  scheduleFirebaseRefresh();

  const now = new Date();
  let since: Date;
  if (data.range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (data.range === "7d") {
    since = new Date(Date.now() - 7 * 86400_000);
  } else {
    since = new Date(Date.now() - 30 * 86400_000);
  }

  let scopedBlockIds: string[] | null = null;
  if (data.blockId || data.regionId || session.role !== "SUPERADMIN") {
    if (data.regionId && !data.blockId) {
      const scopedRegionIds = await getScopedRegionIds(session);
      const allowed = scopedRegionIds ? scopedRegionIds.includes(data.regionId) : true;
      if (!allowed) {
        scopedBlockIds = [];
      } else {
        const blocks = await prisma.block.findMany({ where: { regionId: data.regionId }, select: { id: true } });
        scopedBlockIds = blocks.map((b) => b.id);
      }
    } else {
      scopedBlockIds = await getScopedBlockIds(session, data.blockId);
      if (data.regionId) {
        const regionBlocks = new Set(
          (await prisma.block.findMany({ where: { regionId: data.regionId }, select: { id: true } })).map((b) => b.id),
        );
        scopedBlockIds = scopedBlockIds.filter((id) => regionBlocks.has(id));
      }
    }
  }

  const blockFilter: Prisma.SensorReadingWhereInput = scopedBlockIds
    ? { sprayer: { blockId: { in: scopedBlockIds } } }
    : {};
  const eventFilter: Prisma.IrrigationEventWhereInput = scopedBlockIds
    ? { sprayer: { blockId: { in: scopedBlockIds } } }
    : {};

  const readings = await prisma.sensorReading.findMany({
    where: { ...blockFilter, recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    select: {
      recordedAt: true,
      moisturePercent: true,
      flowLmin: true,
      totalVolumeLiter: true,
      moistureStatus: true,
      sprayer: {
        select: {
          block: {
            select: { id: true, name: true, region: { select: { name: true, volumeDivider: true } } },
          },
        },
      },
    },
    take: 2000,
  });
  readings.reverse();

  const events = await prisma.irrigationEvent.findMany({
    where: { ...eventFilter, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    select: {
      mode: true,
      relay: true,
      startedAt: true,
      endedAt: true,
      sprayer: { select: { block: { select: { id: true } } } },
    },
    take: 5000,
  });

  return {
    readings: readings.map((r) => {
      const block = r.sprayer.block;
      const volumeDivider = Number(block.region.volumeDivider ?? 1);
      return {
        recordedAt: r.recordedAt.toISOString(),
        moisturePercent: Number(r.moisturePercent),
        flowLmin: Number(r.flowLmin) / volumeDivider,
        totalVolumeLiter: r.totalVolumeLiter === null ? null : Number(r.totalVolumeLiter) / volumeDivider,
        moistureStatus: r.moistureStatus,
        block: { id: block.id, name: block.name, region: { name: block.region.name } },
      };
    }),
    events: events.map((e) => ({
      blockId: e.sprayer.block.id,
      mode: e.mode,
      relay: e.relay,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
    })),
    since: since.toISOString(),
  };
}
