import "server-only";

import { prisma } from "../db/prisma";
import { ensureSprayerHistory } from "../integrations/firebase";

/**
 * The history page reads the website database (indexed, keyset-paginated), and
 * Firebase `history` is the source of truth. Before the first page is served,
 * the in-scope sprayers are brought up to date: the first visit backfills the
 * whole history once, later visits only re-read today's and yesterday's date
 * nodes.
 *
 * The wait is bounded: a slow or unreachable Firebase must degrade to serving
 * what is already stored, never to a failing page. Work that outlives the wait
 * keeps running and is picked up by the next request.
 */
const WAIT_MS = 6_000;
const REFRESH_INTERVAL_MS = 15_000;
const CONCURRENCY = 6;

const lastStartedAt = new Map<string, number>();

export async function ensureHistoryFresh(blockIds: string[] | null) {
  if (blockIds && blockIds.length === 0) return;

  const sprayers = await prisma.sprayer.findMany({
    where: { isActive: true, ...(blockIds ? { blockId: { in: blockIds } } : {}) },
    select: {
      id: true,
      hardwareId: true,
      block: { select: { name: true, region: { select: { name: true } } } },
    },
  });

  const now = Date.now();
  const due = sprayers.filter((sprayer) => now - (lastStartedAt.get(sprayer.id) ?? 0) >= REFRESH_INTERVAL_MS);
  if (due.length === 0) return;
  for (const sprayer of due) lastStartedAt.set(sprayer.id, now);

  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, due.length) }, async () => {
    while (next < due.length) {
      const sprayer = due[next++]!;
      try {
        await ensureSprayerHistory({
          id: sprayer.id,
          regionName: sprayer.block.region.name,
          blockName: sprayer.block.name,
          hardwareId: sprayer.hardwareId,
        });
      } catch (error) {
        console.error(`[firebase] history refresh failed for sprayer ${sprayer.id}:`, error);
      }
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, WAIT_MS);
  });
  try {
    await Promise.race([Promise.all(workers), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
