"use server";

import type { ActivityAction, Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { serverCache } from "../cache";
import { buildActivityLogWhere } from "../domain/activityLogQuery";
import { activityLogFiltersSchema, parseInput } from "../validation";
import { LOG_SORT_KEYS, type LogSortKey } from "~/constants/activity-log";
import { endOfJakartaDayExclusive, isValidDateOnly, startOfJakartaDay } from "~/lib/shared/datetime";
import { resolveSort, type TableSort } from "~/lib/shared/tableSort";
import type { ActivityLogItem } from "~/types/logs";

export type { ActivityLogItem };
export type ActivityLogRow = ActivityLogItem & { ipAddress: string | null };

const MAX_LOG_OFFSET = 10_000;
const LOG_COUNT_TTL_MS = 15_000;
const LOG_COUNT_PREFIX = "logs:count:";

const dateOnly = z.string().refine(isValidDateOnly, "Tanggal tidak valid.").optional();

// Extends the shared filter schema locally (validation/content.ts is not ours to edit).
const logQuerySchema = activityLogFiltersSchema.extend({
  search: z.string().trim().max(100).optional(),
  dateFrom: dateOnly,
  dateTo: dateOnly,
  sortKey: z.string().max(32).optional(),
  sortDir: z.string().max(8).optional(),
});

const DEFAULT_SORT: TableSort<LogSortKey> = { key: "createdAt", dir: "desc" };

/** Allow-list: sort key -> Prisma orderBy. `id` is appended by the caller as tiebreaker. */
function orderByFor(sort: TableSort<LogSortKey>, canSeeIp: boolean): Prisma.ActivityLogOrderByWithRelationInput[] {
  const { dir } = sort;
  const primary: Prisma.ActivityLogOrderByWithRelationInput =
    sort.key === "actor"
      ? { actor: { name: dir } }
      : sort.key === "action"
        ? { action: dir }
        : sort.key === "entityType"
          ? { entityType: dir }
          : sort.key === "entityId"
            ? { entityId: dir }
            : sort.key === "ipAddress" && canSeeIp
              ? { ipAddress: dir }
              : { createdAt: dir };
  // `id` breaks ties between rows sharing a value so pages never overlap.
  const keyed = sort.key === "createdAt" || (sort.key === "ipAddress" && !canSeeIp);
  return keyed ? [primary, { id: dir }] : [primary, { createdAt: "desc" }, { id: "desc" }];
}

function searchWhere(search: string, canSeeIp: boolean): Prisma.ActivityLogWhereInput {
  return {
    OR: [
      { actor: { is: { name: { contains: search } } } },
      { actor: { is: { email: { contains: search } } } },
      { entityType: { contains: search } },
      { entityId: { contains: search } },
      // Login IPs are personal data of other users: SUPERADMIN only.
      ...(canSeeIp ? [{ ipAddress: { contains: search } }] : []),
    ],
  };
}

export async function getActivityLogs(input?: {
  action?: string;
  category?: "auth" | "system";
  limit?: number;
  offset?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortKey?: string;
  sortDir?: string;
}) {
  const data = input ? parseInput(logQuerySchema, input) : {};
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") return { logs: [], total: 0, forbidden: true };

  const sort = resolveSort(LOG_SORT_KEYS, { key: data.sortKey, dir: data.sortDir }, DEFAULT_SORT);
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (data.dateFrom) createdAt.gte = startOfJakartaDay(data.dateFrom);
  if (data.dateTo) createdAt.lt = endOfJakartaDayExclusive(data.dateTo);

  const scoped = await buildActivityLogWhere(session, {
    ...(data.action ? { action: data.action as ActivityAction } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
  });
  if (!scoped) return { logs: [], total: 0 };
  const search = data.search ?? "";
  const canSeeIp = session.role === "SUPERADMIN";
  const where: Prisma.ActivityLogWhereInput = search ? { AND: [scoped, searchWhere(search, canSeeIp)] } : scoped;

  const offset = data.offset ?? 0;
  // Scoped per role + user so one account's cached count is never served to another.
  const countKey = `${LOG_COUNT_PREFIX}${session.role}:${session.id}:${JSON.stringify([
    data.category ?? "",
    data.action ?? "",
    search,
    data.dateFrom ?? "",
    data.dateTo ?? "",
  ])}`;
  // Deep offsets force MariaDB to walk and discard every skipped row; the
  // totals are still returned so the pager stays consistent.
  const deepOffset = offset > MAX_LOG_OFFSET;

  const [logs, total] = await Promise.all([
    deepOffset
      ? Promise.resolve([])
      : prisma.activityLog.findMany({
          where,
          orderBy: orderByFor(sort, canSeeIp),
          take: data.limit ?? 50,
          skip: offset,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            ipAddress: canSeeIp,
            createdAt: true,
            metadata: true,
            actor: { select: { name: true, email: true } },
          },
        }),
    // COUNT(*) per page is wasteful; reuse it briefly for the same scope + filter (sort does not affect it).
    serverCache.getOrSet(countKey, () => prisma.activityLog.count({ where }), LOG_COUNT_TTL_MS),
  ]);

  // Pages past MAX_LOG_OFFSET are never served, so the pager must not offer them.
  const reachable = MAX_LOG_OFFSET + (data.limit ?? 50);
  return { logs: logs as ActivityLogRow[], total: Math.min(total, reachable) };
}
