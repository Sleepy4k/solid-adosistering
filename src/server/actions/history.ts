"use server";

import type { Prisma } from "@prisma/client";
import { IrrigationMode, RelayState } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import {
  displayMoistureStatus,
  getRegionThresholdMap,
  getScopedBlockIds,
  getScopedRegionIds,
  refreshFirebaseCache,
} from "./_helpers";
import type { HistoryFilters } from "~/types/history";

export type { HistoryFilters };

const MAX_PAGE_SIZE = 85;
const DEFAULT_PAGE_SIZE = 10;

export async function getIrrigationHistory(filters: HistoryFilters) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  await refreshFirebaseCache();

  const where: Prisma.IrrigationEventWhereInput = {};

  if (session.role !== "SUPERADMIN" || filters.blockId || filters.regionId) {
    let scopedBlockIds: string[];
    if (filters.regionId && !filters.blockId) {
      const scopedRegionIds = await getScopedRegionIds(session);
      const allowed = scopedRegionIds ? scopedRegionIds.includes(filters.regionId) : true;
      if (!allowed) {
        scopedBlockIds = [];
      } else {
        const blocks = await prisma.block.findMany({
          where: { regionId: filters.regionId },
          select: { id: true },
        });
        scopedBlockIds = blocks.map((b) => b.id);
      }
    } else {
      scopedBlockIds = await getScopedBlockIds(session, filters.blockId);
      if (filters.regionId) {
        const regionBlocks = new Set(
          (await prisma.block.findMany({ where: { regionId: filters.regionId }, select: { id: true } })).map(
            (b) => b.id,
          ),
        );
        scopedBlockIds = scopedBlockIds.filter((id) => regionBlocks.has(id));
      }
    }
    where.blockId = { in: scopedBlockIds };
  }

  if (filters.status) where.relay = filters.status === "ON" ? RelayState.ON : RelayState.OFF;
  if (filters.mode) where.mode = filters.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;

  const startedAtFilter: { gte?: Date; lt?: Date } = {};
  if (filters.dateFrom) startedAtFilter.gte = new Date(filters.dateFrom);
  if (filters.dateTo) {
    const d = new Date(filters.dateTo);
    d.setDate(d.getDate() + 1);
    startedAtFilter.lt = d;
  }
  if (startedAtFilter.gte || startedAtFilter.lt) where.startedAt = startedAtFilter;

  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const cursor = filters.cursor;

  const events = await prisma.irrigationEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      mode: true,
      relay: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      totalVolumeLiter: true,
      block: {
        select: { id: true, name: true, region: { select: { id: true, name: true, volumeDivider: true } } },
      },
      sprayer: { select: { id: true, displayName: true, hardwareId: true } },
      actor: { select: { id: true, name: true } },
    },
  });

  const hasMore = events.length > limit;
  if (hasMore) events.pop();

  const thresholdMap =
    session.role === "USER"
      ? await getRegionThresholdMap(session.id, [...new Set(events.map((e) => e.block.region.id))])
      : new Map<string, Awaited<ReturnType<typeof getRegionThresholdMap>> extends Map<string, infer T> ? T : never>();

  const readings = await Promise.all(
    events.map((event) =>
      prisma.sensorReading.findFirst({
        where: {
          blockId: event.block.id,
          sprayerId: event.sprayer.id,
          recordedAt: { lte: event.startedAt },
        },
        orderBy: { recordedAt: "desc" },
        select: {
          moisturePercent: true,
          flowLmin: true,
          totalVolumeLiter: true,
          moistureStatus: true,
        },
      }),
    ),
  );

  const items = events.map((event, index) => {
    const reading = readings[index];
    const moisturePercent = reading ? Number(reading.moisturePercent) : null;
    const threshold = thresholdMap.get(event.block.region.id) ?? null;
    const volumeDivider = Number(event.block.region.volumeDivider ?? 1);

    const rawVolume =
      event.totalVolumeLiter === null
        ? reading?.totalVolumeLiter == null
          ? null
          : Number(reading.totalVolumeLiter)
        : Number(event.totalVolumeLiter);

    const durationSeconds =
      event.durationSeconds ??
      (event.endedAt
        ? Math.round((event.endedAt.getTime() - event.startedAt.getTime()) / 1000)
        : null);

    return {
      id: event.id,
      mode: event.mode,
      relay: event.relay,
      startedAt: event.startedAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
      durationSeconds,
      totalVolumeLiter: rawVolume === null ? null : rawVolume / volumeDivider,
      block: {
        id: event.block.id,
        name: event.block.name,
        region: { id: event.block.region.id, name: event.block.region.name },
      },
      sprayer: event.sprayer,
      actor: event.actor,
      sensor: reading
        ? {
            moisturePercent,
            flowLmin: Number(reading.flowLmin) / volumeDivider,
            moistureStatus:
              moisturePercent === null ? reading.moistureStatus : displayMoistureStatus(moisturePercent, threshold),
          }
        : null,
    };
  });

  return {
    items,
    nextCursor: hasMore ? (events[events.length - 1]?.id ?? null) : null,
  };
}

export async function getMyBlocks() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const regionIds = await getScopedRegionIds(session);
  return prisma.block.findMany({
    where: regionIds ? { regionId: { in: regionIds } } : undefined,
    select: { id: true, name: true, region: { select: { id: true, name: true } } },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
  });
}
