import { createSignal, onCleanup, onMount } from "solid-js";
import type { LiveSprayerData } from "~/lib/shared/irrigation";
import { getVolumeTotals } from "~/server/actions/volume";

const REFRESH_MS = 30_000;

/**
 * Water volume per sprayer for the dashboard.
 *
 * The device reports a flow rate (L/min), not a cumulative counter, so the
 * total is `lifetime volume stored from finished sessions` (server, refreshed
 * every 30 s) plus `liters integrated from the live flow` for the session that
 * is running. When a session finishes and its stored volume arrives, the part
 * of the running total that the server has now counted is subtracted, so
 * nothing is double counted and the total never dips. A device that does keep a
 * cumulative counter (`total_liter`) is shown as reported.
 */
export function createVolumeTotals(sprayerIds: () => string[]) {
  const [totals, setTotals] = createSignal<Record<string, number>>({});
  const baseline = new Map<string, number>();

  const load = async () => {
    const ids = sprayerIds();
    if (ids.length === 0) return;
    try {
      const next = await getVolumeTotals(ids);
      for (const id of ids) if (!baseline.has(id) && id in next) baseline.set(id, next[id] ?? 0);
      setTotals(next);
    } catch {
      // Keep showing the last known totals; the next tick retries.
    }
  };

  onMount(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    onCleanup(() => clearInterval(timer));
  });

  /** Liters for the sprayer with database id `id`, given its live row (if any). */
  const volumeFor = (id: string, row: LiveSprayerData | null) => {
    if (row?.hasVolumeCounter) return row.totalVolumeLiter;
    const stored = totals()[id] ?? 0;
    const alreadyCounted = Math.max(0, stored - (baseline.get(id) ?? stored));
    return stored + Math.max(0, (row?.sessionVolumeLiter ?? 0) - alreadyCounted);
  };

  return { volumeFor };
}
