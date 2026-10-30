"use server";

import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { getScopedRegionIds, scheduleFirebaseRefresh } from "../domain";

const MAX_IDS = 100;

/**
 * Lifetime water volume per sprayer, in liters, summed from the stored
 * irrigation sessions (the device's per-session `totalVolume`, already counted
 * at 27 pulses per liter) and divided by the region's `volumeDivider`.
 *
 * The V2 firmware reports a flow rate but no cumulative counter, so the
 * dashboard shows `this total + the session currently running`. Calling this
 * also nudges the throttled Firebase import so finished sessions land here.
 */
export async function getVolumeTotals(sprayerIds: string[]): Promise<Record<string, number>> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (!Array.isArray(sprayerIds) || sprayerIds.length > MAX_IDS) {
    throw new Response("Daftar sprayer tidak valid.", { status: 400 });
  }
  const ids = [...new Set(sprayerIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 191))];
  if (ids.length === 0) return {};

  scheduleFirebaseRefresh();

  const regionIds = await getScopedRegionIds(session);
  const sprayers = await prisma.sprayer.findMany({
    where: { id: { in: ids }, ...(regionIds ? { block: { regionId: { in: regionIds } } } : {}) },
    select: { id: true, block: { select: { region: { select: { volumeDivider: true } } } } },
  });
  if (sprayers.length === 0) return {};

  const sums = await prisma.irrigationEvent.groupBy({
    by: ["sprayerId"],
    where: { sprayerId: { in: sprayers.map((sprayer) => sprayer.id) }, totalVolumeLiter: { not: null } },
    _sum: { totalVolumeLiter: true },
  });
  const sumBySprayer = new Map(sums.map((row) => [row.sprayerId, Number(row._sum.totalVolumeLiter ?? 0)]));

  const totals: Record<string, number> = {};
  for (const sprayer of sprayers) {
    const divider = Number(sprayer.block.region.volumeDivider);
    const safeDivider = Number.isFinite(divider) && divider > 0 ? divider : 1;
    totals[sprayer.id] = (sumBySprayer.get(sprayer.id) ?? 0) / safeDivider;
  }
  return totals;
}
