import "server-only";
import { prisma } from "../db/prisma";

/**
 * "Latest data update" per sprayer, stored in the website database.
 *
 * It is `sprayer.firebase_synced_at`, which every Firebase sync stamps. A
 * sprayer that has never been stamped gets the current timestamp persisted
 * here, so the value is stable across requests instead of drifting to "now" on
 * every page load.
 */
export async function getDataStampBySprayer(sprayerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(sprayerIds)];
  const stamps = new Map<string, string>();
  if (ids.length === 0) return stamps;

  const rows = await prisma.sprayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, firebaseSyncedAt: true },
  });

  const now = new Date();
  const missing = rows.filter((row) => row.firebaseSyncedAt === null).map((row) => row.id);
  if (missing.length > 0) {
    // The null guard keeps a concurrent real sync stamp from being overwritten.
    await prisma.sprayer.updateMany({
      where: { id: { in: missing }, firebaseSyncedAt: null },
      data: { firebaseSyncedAt: now },
    });
  }

  for (const row of rows) stamps.set(row.id, (row.firebaseSyncedAt ?? now).toISOString());
  return stamps;
}
