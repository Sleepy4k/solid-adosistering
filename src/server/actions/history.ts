"use server";

import { redirect } from "@solidjs/router";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { historyFiltersSchema, parseInput } from "../validation";
import { getScopedRegionIds } from "../domain";
import { buildIrrigationEventWhere, resolveHistoryBlockScope } from "../domain/historyQuery";
import { ensureHistoryFresh } from "../domain/historyFresh";
import { enrichIrrigationEvents, historyEventSelect } from "../domain/historyData";
import { endOfJakartaDayExclusive, isValidDateOnly, startOfJakartaDay } from "~/lib/shared/datetime";
import { resolveSort, type SortDir, type TableSort } from "~/lib/shared/tableSort";
import type { HistoryFilters } from "~/types/history";

export type { HistoryFilters };

type HistoryRow = Awaited<
  ReturnType<typeof prisma.irrigationEvent.findMany<{ select: typeof historyEventSelect }>>
>[number];

const MAX_PAGE_SIZE = 85;
const DEFAULT_PAGE_SIZE = 10;
const MAX_CURSOR_LENGTH = 256;

const HISTORY_SORT_KEYS = ["startedAt", "durationSeconds", "totalVolumeLiter"] as const;
type HistorySortKey = (typeof HISTORY_SORT_KEYS)[number];
const DEFAULT_SORT: TableSort<HistorySortKey> = { key: "startedAt", dir: "desc" };

const historyQuerySchema = historyFiltersSchema.extend({
  sort: z
    .object({
      key: z.string().trim().max(32).optional(),
      dir: z.string().trim().max(8).optional(),
    })
    .optional(),
});

type HistoryCursor = {
  /** Sort the cursor was issued for; a cursor is rejected under any other sort. */
  k: HistorySortKey;
  d: SortDir;
  /** Sort column value of the last row (ISO date, integer, decimal string) or null. */
  v: string | number | null;
  id: string;
};

const invalidCursor = () => new Response("Cursor riwayat tidak valid.", { status: 400 });

/**
 * Opaque compound cursor for stable keyset pagination, bound to the sort it was
 * issued for. Encoded as base64url(JSON({ k, d, v, id })).
 */
function encodeHistoryCursor(sort: TableSort<HistorySortKey>, row: HistoryRow): string {
  let v: string | number | null;
  if (sort.key === "startedAt") v = row.startedAt.toISOString();
  else if (sort.key === "durationSeconds") v = row.durationSeconds;
  else v = row.totalVolumeLiter == null ? null : row.totalVolumeLiter.toString();
  const cursor: HistoryCursor = { k: sort.key, d: sort.dir, v, id: row.id };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeHistoryCursor(value: string, sort: TableSort<HistorySortKey>): HistoryCursor {
  if (value.length > MAX_CURSOR_LENGTH) throw invalidCursor();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  if (typeof parsed !== "object" || parsed === null) throw invalidCursor();

  const record = parsed as { k?: unknown; d?: unknown; v?: unknown; id?: unknown };
  if (record.k !== sort.key || record.d !== sort.dir) throw invalidCursor();
  if (typeof record.id !== "string" || !record.id || record.id.length > 191) throw invalidCursor();

  let v: string | number | null = null;
  if (record.v !== null) {
    if (sort.key === "startedAt") {
      if (typeof record.v !== "string" || Number.isNaN(new Date(record.v).getTime())) throw invalidCursor();
      v = new Date(record.v).toISOString();
    } else if (sort.key === "durationSeconds") {
      if (typeof record.v !== "number" || !Number.isSafeInteger(record.v)) throw invalidCursor();
      v = record.v;
    } else {
      if (typeof record.v !== "string" || !/^-?\d{1,12}(\.\d{1,2})?$/.test(record.v)) throw invalidCursor();
      v = record.v;
    }
  } else if (sort.key === "startedAt") {
    throw invalidCursor();
  }

  return { k: sort.key, d: sort.dir, v, id: record.id };
}

/** Keyset predicate for the rows strictly after `cursor`, NULLs ordered last. */
function cursorWhere(cursor: HistoryCursor): Prisma.IrrigationEventWhereInput {
  const op = cursor.d === "desc" ? "lt" : "gt";
  const col = cursor.k;
  if (cursor.v === null) return { [col]: null, id: { [op]: cursor.id } };

  const value = col === "startedAt" ? new Date(cursor.v as string) : cursor.v;
  const branches: Prisma.IrrigationEventWhereInput[] = [
    { [col]: { [op]: value } },
    { [col]: value, id: { [op]: cursor.id } },
  ];
  if (col !== "startedAt") branches.push({ [col]: null });
  return { OR: branches };
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
  const data = parseInput(historyQuerySchema, filters);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertValidDateFilter(data.dateFrom, "Tanggal awal");
  assertValidDateFilter(data.dateTo, "Tanggal akhir");

  const startedAt: { gte?: Date; lt?: Date } = {};
  if (data.dateFrom) startedAt.gte = startOfJakartaDay(data.dateFrom);
  if (data.dateTo) startedAt.lt = endOfJakartaDayExclusive(data.dateTo);

  const scope = {
    ...(data.regionId ? { regionId: data.regionId } : {}),
    ...(data.blockId ? { blockId: data.blockId } : {}),
  };
  const where = await buildIrrigationEventWhere(session, {
    ...scope,
    ...(data.status ? { status: data.status } : {}),
    ...(data.mode ? { mode: data.mode } : {}),
    ...(startedAt.gte || startedAt.lt ? { startedAt } : {}),
  });

  // Only the first page pulls from Firebase; "load more" pages read what that
  // refresh already stored.
  if (!data.cursor) await ensureHistoryFresh(await resolveHistoryBlockScope(session, scope));

  const limit = Math.min(data.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const sort = resolveSort(HISTORY_SORT_KEYS, data.sort, DEFAULT_SORT);
  if (data.cursor) where.AND = [cursorWhere(decodeHistoryCursor(data.cursor, sort))];

  // NULL durations/volumes always sort last, in both directions; id is the
  // deterministic tiebreaker and follows the sort direction.
  const orderBy: Prisma.IrrigationEventOrderByWithRelationInput[] =
    sort.key === "startedAt"
      ? [{ startedAt: sort.dir }, { id: sort.dir }]
      : [{ [sort.key]: { sort: sort.dir, nulls: "last" } }, { id: sort.dir }];

  const events = await prisma.irrigationEvent.findMany({
    where,
    orderBy,
    take: limit + 1,
    select: historyEventSelect,
  });

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const items = await enrichIrrigationEvents(page, session.id);

  const lastEvent = page[page.length - 1];

  return {
    items,
    nextCursor: hasMore && lastEvent ? encodeHistoryCursor(sort, lastEvent) : null,
  };
}
