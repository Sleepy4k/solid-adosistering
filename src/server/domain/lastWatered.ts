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
 * "Terakhir siram": when each sprayer last finished (or, if still running,
 * started) an irrigation session. Firebase history sessions are stored with
 * `relay = ON` and an `ended_at`; website-issued ON commands have no end yet.
 * One correlated subquery per sprayer, backed by
 * `irrigation_event(sprayer_id, relay, ended_at)`.
 */
export async function getLastWateredBySprayer(sprayerIds: string[]): Promise<Map<string, string | null>> {
  const uniqueSprayerIds = [...new Set(sprayerIds)];
  const map = new Map<string, string | null>();
  if (uniqueSprayerIds.length === 0) return map;

  const rows = await prisma.$queryRaw<LastWateredRow[]>(Prisma.sql`
    SELECT s.id AS sprayerId,
           (SELECT MAX(COALESCE(ie.ended_at, ie.started_at))
            FROM irrigation_event ie
            WHERE ie.sprayer_id = s.id
              AND ie.relay = 'ON') AS lastWateredAt
    FROM sprayer s
    WHERE s.id IN (${Prisma.join(uniqueSprayerIds)})
  `);

  for (const row of rows) map.set(row.sprayerId, toIsoString(row.lastWateredAt));
  return map;
}
