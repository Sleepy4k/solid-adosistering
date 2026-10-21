"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { addJakartaDays, endOfJakartaDayExclusive, jakartaDateKey, startOfJakartaDay } from "~/lib/shared/datetime";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { getScopedBlockIds, getScopedRegionIds, scheduleFirebaseRefresh } from "../domain";
import { parseInput, statisticsSchema } from "../validation";

type StatisticsRange = "today" | "7d" | "30d";
type Granularity = "2h" | "day";
type Numeric = string | number | bigint | null;

type AggregateRow = {
  bucket: Numeric;
  moistureSum: Numeric;
  moistureCount: Numeric;
  flowSum: Numeric;
  flowCount: Numeric;
  readingCount: Numeric;
};

type ModeGroup = { mode: string; _count: { _all: number } };
type BucketDescriptor = { key: string; label: string };

const PRESET_DAYS: Record<StatisticsRange, number> = { today: 1, "7d": 7, "30d": 30 };
const DAY_MS = 86_400_000;
const TWO_HOUR_BUCKET_COUNT = 12;
const MAX_DAY_BUCKET_COUNT = 32;

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

  const bucketExpression =
    granularity === "2h"
      ? Prisma.sql`FLOOR(HOUR(DATE_ADD(sr.recorded_at, INTERVAL 7 HOUR)) / 2)`
      : Prisma.sql`DATE_FORMAT(DATE_ADD(sr.recorded_at, INTERVAL 7 HOUR), '%Y-%m-%d')`;
  const blockClause =
    scopedBlockIds === null ? Prisma.empty : Prisma.sql`AND sp.block_id IN (${Prisma.join(scopedBlockIds)})`;

  return prisma.$queryRaw<AggregateRow[]>`
    SELECT
      ${bucketExpression} AS bucket,
      SUM(sr.moisture_percent) AS moistureSum,
      COUNT(sr.moisture_percent) AS moistureCount,
      SUM(sr.flow_lmin / COALESCE(NULLIF(reg.volume_divider, 0), 1)) AS flowSum,
      COUNT(sr.flow_lmin) AS flowCount,
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

  const granularity: Granularity = to.getTime() - from.getTime() <= DAY_MS ? "2h" : "day";
  const eventFilter: Prisma.IrrigationEventWhereInput = scopedBlockIds
    ? { sprayer: { blockId: { in: scopedBlockIds } } }
    : {};
  const hasNoScope = scopedBlockIds !== null && scopedBlockIds.length === 0;

  const [rows, modeGroups] = await Promise.all([
    hasNoScope ? Promise.resolve<AggregateRow[]>([]) : fetchReadingAggregates(granularity, from, to, scopedBlockIds),
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

  let totalMoistureSum = 0;
  let totalMoistureCount = 0;
  let totalFlowSum = 0;
  let totalFlowCount = 0;
  let totalReadingCount = 0;
  for (const row of rows) {
    totalMoistureSum += toNumber(row.moistureSum);
    totalMoistureCount += toNumber(row.moistureCount);
    totalFlowSum += toNumber(row.flowSum);
    totalFlowCount += toNumber(row.flowCount);
    totalReadingCount += toNumber(row.readingCount);
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
        const bucketFlowCount = row ? toNumber(row.flowCount) : 0;
        return {
          key,
          label,
          averageMoisture: bucketMoistureCount > 0 ? toNumber(row?.moistureSum ?? null) / bucketMoistureCount : null,
          averageFlow: bucketFlowCount > 0 ? toNumber(row?.flowSum ?? null) / bucketFlowCount : null,
          readingCount: row ? toNumber(row.readingCount) : 0,
        };
      });

  return {
    granularity,
    buckets,
    summary: {
      averageMoisture: totalMoistureCount > 0 ? totalMoistureSum / totalMoistureCount : null,
      averageFlow: totalFlowCount > 0 ? totalFlowSum / totalFlowCount : null,
      totalFlow: totalFlowSum,
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
