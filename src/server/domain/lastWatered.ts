import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

type LastWateredRow = {
  sprayerId: string;
  lastWateredAt: Date | string | null;
};

/** Raw queries may hand back a date string depending on driver settings. */
function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Latest `relay = ON` irrigation start per sprayer, resolved with a single
 * correlated subquery per requested sprayer so dashboards never fan out into
 * per-sprayer lookups. The subquery is backed by
 * `irrigation_event(sprayer_id, started_at)`.
 *
 * Sprayers without an ON event are present with `null` when the sprayer row
 * exists; callers should use `map.get(id) ?? null` when serializing.
 */
export async function getLastWateredBySprayer(sprayerIds: string[]): Promise<Map<string, string | null>> {
  const uniqueSprayerIds = [...new Set(sprayerIds)];
  const map = new Map<string, string | null>();
  if (uniqueSprayerIds.length === 0) return map;

  const rows = await prisma.$queryRaw<LastWateredRow[]>(Prisma.sql`
    SELECT s.id AS sprayerId,
           (SELECT ie.started_at
            FROM irrigation_event ie
            WHERE ie.sprayer_id = s.id
              AND ie.relay = 'ON'
            ORDER BY ie.started_at DESC
            LIMIT 1) AS lastWateredAt
    FROM sprayer s
    WHERE s.id IN (${Prisma.join(uniqueSprayerIds)})
  `);

  for (const row of rows) {
    map.set(row.sprayerId, toIsoString(row.lastWateredAt));
  }

  return map;
}
