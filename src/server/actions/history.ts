"use server";

import { IrrigationMode, Prisma, RelayState } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { historyFiltersSchema, parseInput } from "../validation";
import {
  displayMoistureStatus,
  getRegionThresholdMap,
  getScopedBlockIds,
  getScopedRegionIds,
  scheduleFirebaseRefresh,
} from "../domain";
import type { HistoryFilters } from "~/types/history";

export type { HistoryFilters };

const MAX_PAGE_SIZE = 85;
const DEFAULT_PAGE_SIZE = 10;
const MAX_CURSOR_LENGTH = 256;

type HistoryCursor = {
  startedAt: string;
  id: string;
};

type EventSensorReading = {
  eventId: string;
  moisturePercent: string | number | null;
  flowLmin: string | number | null;
  totalVolumeLiter: string | number | null;
  moistureStatus: string | null;
};

/**
 * Opaque compound cursor for stable keyset pagination.
 * Encoded as base64url(JSON({ startedAt: ISO-8601, id })).
 */
function encodeHistoryCursor(startedAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ startedAt: startedAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeHistoryCursor(value: string): HistoryCursor {
  if (value.length > MAX_CURSOR_LENGTH) throw new Response("Cursor riwayat tidak valid.", { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Response("Cursor riwayat tidak valid.", { status: 400 });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Response("Cursor riwayat tidak valid.", { status: 400 });
  }
  const record = parsed as { startedAt?: unknown; id?: unknown };
  if (typeof record.startedAt !== "string" || typeof record.id !== "string") {
    throw new Response("Cursor riwayat tidak valid.", { status: 400 });
  }
  if (!record.id || record.id.length > 191) throw new Response("Cursor riwayat tidak valid.", { status: 400 });

  const startedAt = new Date(record.startedAt);
  if (Number.isNaN(startedAt.getTime())) throw new Response("Cursor riwayat tidak valid.", { status: 400 });

  return { startedAt: startedAt.toISOString(), id: record.id };
}

export async function getIrrigationHistory(filters: HistoryFilters = {}) {
  const data = parseInput(historyFiltersSchema, filters);
  const session = await getSession();
  if (!session) throw redirect("/login");
  scheduleFirebaseRefresh();

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
    where.sprayer = { blockId: { in: scopedBlockIds } };
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
  const cursor = data.cursor ? decodeHistoryCursor(data.cursor) : null;
  if (cursor) {
    const cursorStartedAt = new Date(cursor.startedAt);
    where.OR = [{ startedAt: { lt: cursorStartedAt } }, { startedAt: cursorStartedAt, id: { lt: cursor.id } }];
  }

  const events = await prisma.irrigationEvent.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      mode: true,
      relay: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      totalVolumeLiter: true,
      sprayer: {
        select: {
          id: true,
          displayName: true,
          hardwareId: true,
          block: {
            select: {
              id: true,
              name: true,
              region: { select: { id: true, name: true, volumeDivider: true } },
            },
          },
        },
      },
      actor: { select: { id: true, name: true } },
    },
  });

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;

  const thresholdMap = await getRegionThresholdMap(session.id, [
    ...new Set(page.map((event) => event.sprayer.block.region.id)),
  ]);

  // One correlated query instead of one query per event (the previous N+1).
  const readingRows: EventSensorReading[] =
    page.length > 0
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
            WHERE sr2.sprayer_id = e.sprayer_id
              AND sr2.recorded_at <= e.started_at
            ORDER BY sr2.recorded_at DESC, sr2.id DESC
            LIMIT 1
          )
          WHERE e.id IN (${Prisma.join(page.map((event) => event.id))})
        `
      : [];
  const readingsByEvent = new Map(readingRows.map((row) => [row.eventId, row]));

  const items = page.map((event) => {
    const reading = readingsByEvent.get(event.id);
    const moisturePercent = reading?.moisturePercent == null ? null : Number(reading.moisturePercent);
    const block = event.sprayer.block;
    const threshold = thresholdMap.get(block.region.id) ?? null;
    const volumeDivider = Number(block.region.volumeDivider ?? 1);

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
        id: block.id,
        name: block.name,
        region: { id: block.region.id, name: block.region.name },
      },
      sprayer: {
        id: event.sprayer.id,
        displayName: event.sprayer.displayName,
        hardwareId: event.sprayer.hardwareId,
      },
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

  const lastEvent = page[page.length - 1];

  return {
    items,
    nextCursor: hasMore && lastEvent ? encodeHistoryCursor(lastEvent.startedAt, lastEvent.id) : null,
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
