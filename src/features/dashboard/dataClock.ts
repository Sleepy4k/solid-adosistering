import { createSignal } from "solid-js";
import type { LiveSprayerData } from "~/lib/shared/irrigation";

/**
 * Fingerprint of the values a device actually reports. The derived flow rate is
 * left out on purpose: it decays on a timer and is not new data.
 */
export function liveFingerprint(row: LiveSprayerData) {
  return [row.moisturePercent, row.totalVolumeLiter, row.pumpOn, row.mode, row.lastUpdated].join("|");
}

/**
 * Tracks when each live row last changed while the page is open. The stored
 * "latest data update" only advances when a server sync runs; this keeps the
 * displayed value moving between syncs. The first snapshot is a baseline, not
 * a change, so opening the page never fakes an update.
 */
export function createDataClock() {
  const seen = new Map<string, string>();
  const [changedAt, setChangedAt] = createSignal<Record<string, number>>({});

  const observe = (key: string, fingerprint: string) => {
    const previous = seen.get(key);
    seen.set(key, fingerprint);
    if (previous !== undefined && previous !== fingerprint) {
      setChangedAt((current) => ({ ...current, [key]: Date.now() }));
    }
  };

  return { changedAt, observe };
}

/** Latest of the stored ISO stamp and an observed change time, in epoch ms. */
export function latestDataUpdate(stored: string | null | undefined, observedMs: number | undefined): number | null {
  const storedMs = stored ? Date.parse(stored) : Number.NaN;
  const candidates = [storedMs, observedMs ?? Number.NaN].filter((value) => Number.isFinite(value));
  return candidates.length > 0 ? Math.max(...candidates) : null;
}
