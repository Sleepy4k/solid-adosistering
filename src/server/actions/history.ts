"use server";

import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { historyFiltersSchema, parseInput } from "../validation";
import { getScopedRegionIds, scheduleFirebaseRefresh } from "../domain";
import { buildIrrigationEventWhere } from "../domain/historyQuery";
import { enrichIrrigationEvents, historyEventSelect } from "../domain/historyData";
import { endOfJakartaDayExclusive, isValidDateOnly, startOfJakartaDay } from "~/lib/shared/datetime";
import type { HistoryFilters } from "~/types/history";

export type { HistoryFilters };

const MAX_PAGE_SIZE = 85;
const DEFAULT_PAGE_SIZE = 10;
const MAX_CURSOR_LENGTH = 256;

type HistoryCursor = {
  startedAt: string;
  id: string;
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

/**
 * The filters schema only checks the `YYYY-MM-DD` shape, so an impossible date
 * such as `2026-02-31` is rejected here instead of reaching the WIB helpers and
 * surfacing as a RangeError.
 */
function assertValidDateFilter(value: string | undefined, label: string): void {
  if (value && !isValidDateOnly(value)) throw new Response(`${label} tidak valid.`, { status: 400 });
}

export async function getIrrigationHistory(filters: HistoryFilters = {}) {
  const data = parseInput(historyFiltersSchema, filters);
  const session = await getSession();
  if (!session) throw redirect("/login");
  scheduleFirebaseRefresh();

  assertValidDateFilter(data.dateFrom, "Tanggal awal");
  assertValidDateFilter(data.dateTo, "Tanggal akhir");

  const startedAt: { gte?: Date; lt?: Date } = {};
  if (data.dateFrom) startedAt.gte = startOfJakartaDay(data.dateFrom);
  if (data.dateTo) startedAt.lt = endOfJakartaDayExclusive(data.dateTo);

  const where = await buildIrrigationEventWhere(session, {
    ...(data.regionId ? { regionId: data.regionId } : {}),
    ...(data.blockId ? { blockId: data.blockId } : {}),
    ...(data.status ? { status: data.status } : {}),
    ...(data.mode ? { mode: data.mode } : {}),
    ...(startedAt.gte || startedAt.lt ? { startedAt } : {}),
  });

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
    select: historyEventSelect,
  });

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const items = await enrichIrrigationEvents(page, session.id);

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
