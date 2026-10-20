"use server";

import { IrrigationMode, Prisma, RelayState } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import { historyFiltersSchema, parseInput } from "../validation";
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

type EventSensorReading = {
  eventId: string;
  moisturePercent: string | number | null;
  flowLmin: string | number | null;
  totalVolumeLiter: string | number | null;
  moistureStatus: string | null;
};

export async function getIrrigationHistory(filters: HistoryFilters = {}) {
  const data = parseInput(historyFiltersSchema, filters);
  const session = await getSession();
  if (!session) throw redirect("/login");
  await refreshFirebaseCache();

  const where: Prisma.IrrigationEventWhereInput = {};

  if (session.role !== "SUPERADMIN" || data.blockId || data.regionId) {
    let scopedBlockIds: string[];
    if (data.regionId && !data.blockId) {
      const scopedRegionIds = await getScopedRegionIds(session);
      const allowed = scopedRegionIds ? scopedRegionIds.includes(data.regionId) : true;
      if (!allowed) {
        scopedBlockIds = [];
      } else {
        const blocks = await prisma.block.findMany({
          where: { regionId: data.regionId },
          select: { id: true },
        });
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
    where.blockId = { in: scopedBlockIds };
  }

  if (data.status) where.relay = data.status === "ON" ? RelayState.ON : RelayState.OFF;
  if (data.mode) where.mode = data.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;

  const startedAtFilter: { gte?: Date; lt?: Date } = {};
  if (data.dateFrom) startedAtFilter.gte = new Date(data.dateFrom);
  if (data.dateTo) {
    const d = new Date(data.dateTo);
    d.setDate(d.getDate() + 1);
    startedAtFilter.lt = d;
  }
  if (startedAtFilter.gte || startedAtFilter.lt) where.startedAt = startedAtFilter;

  const limit = Math.min(data.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const cursor = data.cursor;

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

  // One correlated query instead of one query per event (the previous N+1).
  const readingRows: EventSensorReading[] =
    events.length > 0
      ? await prisma.$queryRaw<EventSensorReading[]>`
          SELECT e.id AS eventId,
                 sr.moisture_percent AS moisturePercent,
                 sr.flow_lmin AS flowLmin,
                 sr.total_volume_liter AS totalVolumeLiter,
                 sr.moisture_status AS moistureStatus
          FROM irrigation_event e
          LEFT JOIN sensor_reading sr ON sr.id = (
            SELECT sr2.id
            FROM sensor_reading sr2
            WHERE sr2.block_id = e.block_id
              AND sr2.sprayer_id = e.sprayer_id
              AND sr2.recorded_at <= e.started_at
            ORDER BY sr2.recorded_at DESC
            LIMIT 1
          )
          WHERE e.id IN (${Prisma.join(events.map((event) => event.id))})
        `
      : [];
  const readingsByEvent = new Map(readingRows.map((row) => [row.eventId, row]));

  const items = events.map((event) => {
    const reading = readingsByEvent.get(event.id);
    const moisturePercent = reading?.moisturePercent == null ? null : Number(reading.moisturePercent);
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
      (event.endedAt ? Math.round((event.endedAt.getTime() - event.startedAt.getTime()) / 1000) : null);

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
              moisturePercent === null
                ? (reading.moistureStatus ?? "KERING")
                : displayMoistureStatus(moisturePercent, threshold),
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
