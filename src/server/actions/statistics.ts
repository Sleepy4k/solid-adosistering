"use server";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { addJakartaDays, endOfJakartaDayExclusive, jakartaDateKey, startOfJakartaDay } from "~/lib/shared/datetime";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { serverCache } from "../cache";
import { getScopedBlockIds, getScopedRegionIds, scheduleFirebaseRefresh } from "../domain";
import { parseInput, statisticsSchema } from "../validation";

type StatisticsRange = "today" | "7d" | "30d";
type Granularity = "2h" | "day";
type Numeric = string | number | bigint | null;

type AggregateRow = {
  bucket: Numeric;
  moistureSum: Numeric;
  moistureCount: Numeric;
  readingCount: Numeric;
};

/** Irrigation sessions per bucket, aggregated from the stored device history. */
type SessionRow = {
  bucket: Numeric;
  sessionCount: Numeric;
  volumeSum: Numeric;
  /** Seconds of the sessions that also have a volume, so flow is volume / time. */
  timedSeconds: Numeric;
  timedVolumeSum: Numeric;
};

type ModeGroup = { mode: string; _count: { _all: number } };
type BucketDescriptor = { key: string; label: string };

const PRESET_DAYS: Record<StatisticsRange, number> = { today: 1, "7d": 7, "30d": 30 };
const DAY_MS = 86_400_000;
const TWO_HOUR_BUCKET_COUNT = 12;
const MAX_DAY_BUCKET_COUNT = 32;
const STATS_CACHE_TTL_MS = 45_000;
const STATS_CACHE_PREFIX = "stats:";

const dayLabelFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Jakarta",
});

/** MySQL aggregate results are driver-dependent; normalise them once. */
function toNumber(value: Numeric): number {
  return value === null ? 0 : Number(value);
}

function bucketKey(granularity: Granularity, value: Numeric): string {
  // FLOOR() comes back as a DECIMAL ("0.0000" on some drivers), so numeric
  // normalisation keeps the key aligned with the client-side "0"..."11" set.
  return granularity === "2h" ? String(Number(value)) : String(value);
}

/**
 * Complete bucket descriptors (including periods without data) so the chart
 * can render gaps instead of collapsing empty windows.
 */
function buildBuckets(granularity: Granularity, from: Date, to: Date): BucketDescriptor[] {
  if (granularity === "2h") {
    return Array.from({ length: TWO_HOUR_BUCKET_COUNT }, (_, index) => ({
      key: String(index),
      label: `${String(index * 2).padStart(2, "0")}:00`,
    }));
  }

  const buckets: BucketDescriptor[] = [];
  let cursor = from;
  // Valid windows are capped at 31 WIB days by the schema; the bound below only
  // guards against a pathological loop and never truncates a valid range.
  while (cursor.getTime() < to.getTime() && buckets.length < MAX_DAY_BUCKET_COUNT) {
    buckets.push({ key: jakartaDateKey(cursor), label: dayLabelFormatter.format(cursor) });
    cursor = addJakartaDays(cursor, 1);
  }
  return buckets;
}

/** WIB (UTC+7) bucket of a timestamp column; `column` is always a fixed literal. */
function bucketSql(granularity: Granularity, column: Prisma.Sql) {
  return granularity === "2h"
    ? Prisma.sql`FLOOR(HOUR(DATE_ADD(${column}, INTERVAL 7 HOUR)) / 2)`
    : Prisma.sql`DATE_FORMAT(DATE_ADD(${column}, INTERVAL 7 HOUR), '%Y-%m-%d')`;
}

/**
 * Water statistics come from the irrigation sessions the device reports
 * (history: `totalVolume` in liters and `duration` in seconds), not from
 * summing instantaneous flow readings, which are rates and idle zeros.
 *   volume   = sum of session liters (/ region volume divider)
 *   minutes  = sum of session seconds / 60
 *   avg flow = volume / minutes   (L/min while watering)
 */
async function fetchSessionAggregates(
  granularity: Granularity,
  from: Date,
  to: Date,
  scopedBlockIds: string[] | null,
): Promise<SessionRow[]> {
  if (scopedBlockIds !== null && scopedBlockIds.length === 0) return [];

  const bucketExpression = bucketSql(granularity, Prisma.raw("ie.started_at"));
  const blockClause =
    scopedBlockIds === null ? Prisma.empty : Prisma.sql`AND sp.block_id IN (${Prisma.join(scopedBlockIds)})`;

  return prisma.$queryRaw<SessionRow[]>`
    SELECT
      ${bucketExpression} AS bucket,
      COUNT(*) AS sessionCount,
      SUM(ie.total_volume_liter / COALESCE(NULLIF(reg.volume_divider, 0), 1)) AS volumeSum,
      SUM(CASE WHEN ie.total_volume_liter IS NOT NULL AND ie.duration_seconds > 0
               THEN ie.duration_seconds ELSE 0 END) AS timedSeconds,
      SUM(CASE WHEN ie.total_volume_liter IS NOT NULL AND ie.duration_seconds > 0
               THEN ie.total_volume_liter / COALESCE(NULLIF(reg.volume_divider, 0), 1) ELSE 0 END) AS timedVolumeSum
    FROM irrigation_event ie
    INNER JOIN sprayer sp ON sp.id = ie.sprayer_id
    INNER JOIN block b ON b.id = sp.block_id
    INNER JOIN region reg ON reg.id = b.region_id
    WHERE ie.relay = 'ON'
      AND ie.started_at >= ${from} AND ie.started_at < ${to}
      ${blockClause}
    GROUP BY ${bucketExpression}
    ORDER BY bucket ASC
  `;
}

/**
 * Aggregate inside MySQL so long windows never stream raw sensor rows into the
 * app (the previous raw-read cap silently truncated 7d/30d charts).
 *
 * `bucketExpression` and the joins are fixed literals; only `from`, `to`, and
 * the scoped block IDs are bound parameters.
 */
async function fetchReadingAggregates(
  granularity: Granularity,
  from: Date,
  to: Date,
  scopedBlockIds: string[] | null,
): Promise<AggregateRow[]> {
  // Defensive: the caller already short-circuits an empty scope, and an empty
  // `IN ()` would otherwise depend on driver-specific SQL generation.
  if (scopedBlockIds !== null && scopedBlockIds.length === 0) return [];

  const bucketExpression = bucketSql(granularity, Prisma.raw("sr.recorded_at"));
  const blockClause =
    scopedBlockIds === null ? Prisma.empty : Prisma.sql`AND sp.block_id IN (${Prisma.join(scopedBlockIds)})`;

  return prisma.$queryRaw<AggregateRow[]>`
    SELECT
      ${bucketExpression} AS bucket,
      SUM(sr.moisture_percent) AS moistureSum,
      COUNT(sr.moisture_percent) AS moistureCount,
      COUNT(*) AS readingCount
    FROM sensor_reading sr
    INNER JOIN sprayer sp ON sp.id = sr.sprayer_id
    INNER JOIN block b ON b.id = sp.block_id
    INNER JOIN region reg ON reg.id = b.region_id
    WHERE sr.recorded_at >= ${from} AND sr.recorded_at < ${to}
      ${blockClause}
    GROUP BY ${bucketExpression}
    ORDER BY bucket ASC
  `;
}

export async function getStatistics(input: {
  blockId?: string;
  regionId?: string;
  range?: StatisticsRange;
  dateFrom?: string;
  dateTo?: string;
}) {
  const data = parseInput(statisticsSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  scheduleFirebaseRefresh();

  // Every window is aligned to WIB calendar days and `to` is exclusive. Custom
  // dates win over the preset range; the schema guarantees both bounds are set.
  let to: Date;
  let from: Date;
  if (data.dateFrom && data.dateTo) {
    from = startOfJakartaDay(data.dateFrom);
    to = endOfJakartaDayExclusive(data.dateTo);
  } else {
    const days = PRESET_DAYS[data.range ?? "today"];
    to = endOfJakartaDayExclusive(jakartaDateKey(new Date()));
    from = addJakartaDays(to, -days);
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

  // The key carries role, user, and the exact resolved block scope, so entries
  // are never shared between different scopes. The block list is hashed to keep
  // keys short; sorting makes it order-independent.
  const scopeHash =
    scopedBlockIds === null
      ? "all"
      : createHash("sha256")
          .update([...scopedBlockIds].sort().join(","))
          .digest("hex")
          .slice(0, 32);
  const cacheKey = `${STATS_CACHE_PREFIX}${session.role}:${session.id}:${scopeHash}:${from.getTime()}:${to.getTime()}`;
  return serverCache.getOrSet(cacheKey, () => computeStatistics(from, to, scopedBlockIds), STATS_CACHE_TTL_MS);
}

async function computeStatistics(from: Date, to: Date, scopedBlockIds: string[] | null) {
  const granularity: Granularity = to.getTime() - from.getTime() <= DAY_MS ? "2h" : "day";
  const eventFilter: Prisma.IrrigationEventWhereInput = scopedBlockIds
    ? { sprayer: { blockId: { in: scopedBlockIds } } }
    : {};
  const hasNoScope = scopedBlockIds !== null && scopedBlockIds.length === 0;

  const [rows, sessionRows, modeGroups] = await Promise.all([
    hasNoScope ? Promise.resolve<AggregateRow[]>([]) : fetchReadingAggregates(granularity, from, to, scopedBlockIds),
    hasNoScope ? Promise.resolve<SessionRow[]>([]) : fetchSessionAggregates(granularity, from, to, scopedBlockIds),
    hasNoScope
      ? Promise.resolve<ModeGroup[]>([])
      : prisma.irrigationEvent.groupBy({
          by: ["mode"],
          where: { ...eventFilter, startedAt: { gte: from, lt: to } },
          _count: { _all: true },
        }),
  ]);

  const rowsByBucket = new Map<string, AggregateRow>();
  for (const row of rows) rowsByBucket.set(bucketKey(granularity, row.bucket), row);
  const sessionsByBucket = new Map<string, SessionRow>();
  for (const row of sessionRows) sessionsByBucket.set(bucketKey(granularity, row.bucket), row);

  let totalMoistureSum = 0;
  let totalMoistureCount = 0;
  let totalReadingCount = 0;
  let totalVolume = 0;
  let totalSessions = 0;
  let timedSeconds = 0;
  let timedVolume = 0;
  for (const row of rows) {
    totalMoistureSum += toNumber(row.moistureSum);
    totalMoistureCount += toNumber(row.moistureCount);
    totalReadingCount += toNumber(row.readingCount);
  }
  for (const row of sessionRows) {
    totalVolume += toNumber(row.volumeSum);
    totalSessions += toNumber(row.sessionCount);
    timedSeconds += toNumber(row.timedSeconds);
    timedVolume += toNumber(row.timedVolumeSum);
  }

  let irrigationCount = 0;
  let autoCount = 0;
  let manualCount = 0;
  for (const group of modeGroups) {
    const count = group._count._all;
    irrigationCount += count;
    if (group.mode === "AUTO") autoCount = count;
    else if (group.mode === "MANUAL") manualCount = count;
  }

  const buckets = hasNoScope
    ? []
    : buildBuckets(granularity, from, to).map(({ key, label }) => {
        const row = rowsByBucket.get(key);
        const bucketMoistureCount = row ? toNumber(row.moistureCount) : 0;
        const session = sessionsByBucket.get(key);
        const bucketTimedMinutes = session ? toNumber(session.timedSeconds) / 60 : 0;
        return {
          key,
          label,
          averageMoisture: bucketMoistureCount > 0 ? toNumber(row?.moistureSum ?? null) / bucketMoistureCount : null,
          // L/min while watering = liters / minutes of the same sessions.
          averageFlow: session && bucketTimedMinutes > 0 ? toNumber(session.timedVolumeSum) / bucketTimedMinutes : null,
          totalVolume: session ? toNumber(session.volumeSum) : null,
          sessionCount: session ? toNumber(session.sessionCount) : 0,
          readingCount: row ? toNumber(row.readingCount) : 0,
        };
      });

  return {
    granularity,
    buckets,
    summary: {
      averageMoisture: totalMoistureCount > 0 ? totalMoistureSum / totalMoistureCount : null,
      averageFlow: timedSeconds > 0 ? timedVolume / (timedSeconds / 60) : null,
      totalVolume,
      totalDurationMinutes: timedSeconds / 60,
      sessionCount: totalSessions,
      readingCount: totalReadingCount,
      irrigationCount,
      autoCount,
      manualCount,
    },
    since: from.toISOString(),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
