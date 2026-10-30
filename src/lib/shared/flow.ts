/**
 * Manual flow-rate estimation for devices whose Firebase `flow_Lmin` is not
 * populated. Flow is derived from the cumulative `total_liter` counter: the
 * liters gained between observed snapshots divided by the elapsed time.
 *
 * Pure and dependency-free so it can be unit-tested and shared by every client
 * subscription. Time is the observer's wall clock (`atMs`), never the device
 * clock, because device timestamps only change when the device decides to.
 */

/** Samples older than this (relative to the newest one) are dropped. */
export const FLOW_WINDOW_MS = 30_000;
/** Flow is reported as zero once the counter has not advanced for this long while the pump is on. */
export const FLOW_IDLE_PUMP_ON_MS = 40_000;
/** Same, once the pump reports off: only the hydraulic tail-off is tolerated. */
export const FLOW_IDLE_PUMP_OFF_MS = 10_000;

type FlowSample = { atMs: number; liters: number };

export type FlowEstimator = {
  /** Record the cumulative liter counter observed at `atMs`. */
  push(key: string, liters: number, atMs: number): void;
  /** Liters per minute at `nowMs`; always finite and never negative. */
  estimate(key: string, nowMs: number, pumpOn: boolean): number;
};

export function createFlowEstimator(): FlowEstimator {
  const samples = new Map<string, FlowSample[]>();
  const lastAdvanceAt = new Map<string, number>();

  return {
    push(key, liters, atMs) {
      if (!Number.isFinite(liters) || !Number.isFinite(atMs)) return;
      const list = samples.get(key) ?? [];
      const last = list[list.length - 1];

      if (last && liters < last.liters) {
        // The counter went backwards (device restart or rollover): the old
        // samples no longer describe the same series.
        list.length = 0;
        lastAdvanceAt.delete(key);
      } else if (last) {
        const advanced = liters > last.liters;
        // Idle for longer than the window: keeping the old baseline would
        // stretch the slope over the whole gap and understate the real flow.
        // Restart the series; the next sample yields a proper slope.
        if (atMs - last.atMs > FLOW_WINDOW_MS) list.length = 0;
        if (advanced) lastAdvanceAt.set(key, atMs);
      }

      list.push({ atMs, liters });
      // Keep exactly one sample at or before the window start so a slow
      // reporter still yields a slope instead of a single point.
      while (list.length > 2 && list[1]!.atMs <= atMs - FLOW_WINDOW_MS) list.shift();
      samples.set(key, list);
    },

    estimate(key, nowMs, pumpOn) {
      const list = samples.get(key);
      if (!list || list.length < 2) return 0;

      const advancedAt = lastAdvanceAt.get(key);
      if (advancedAt === undefined) return 0;
      const idleMs = pumpOn ? FLOW_IDLE_PUMP_ON_MS : FLOW_IDLE_PUMP_OFF_MS;
      if (nowMs - advancedAt > idleMs) return 0;

      const first = list[0]!;
      const last = list[list.length - 1]!;
      const minutes = (last.atMs - first.atMs) / 60_000;
      if (minutes <= 0) return 0;

      const flow = (last.liters - first.liters) / minutes;
      return Number.isFinite(flow) && flow > 0 ? flow : 0;
    },
  };
}

/** A gap longer than this between two observations is not integrated over. */
export const VOLUME_MAX_GAP_MS = 15_000;

export type VolumeTracker = {
  /**
   * Add `flowLmin x elapsed` (L/min -> liters: minutes = ms / 60000) to the
   * running total of `key` and return it. The first call only sets the clock.
   */
  advance(key: string, flowLmin: number, nowMs: number): number;
};

/**
 * Integrates the reported flow rate into liters while a page is open. Used when
 * the device reports `flow_Lmin` but no cumulative counter (the V2 firmware):
 * the total is `lifetime from stored sessions + this running session`.
 */
export function createVolumeTracker(): VolumeTracker {
  const state = new Map<string, { atMs: number; liters: number }>();
  return {
    advance(key, flowLmin, nowMs) {
      const current = state.get(key);
      if (!current) {
        state.set(key, { atMs: nowMs, liters: 0 });
        return 0;
      }
      const elapsedMs = Math.min(Math.max(nowMs - current.atMs, 0), VOLUME_MAX_GAP_MS);
      if (Number.isFinite(flowLmin) && flowLmin > 0) current.liters += (flowLmin * elapsedMs) / 60_000;
      current.atMs = nowMs;
      return current.liters;
    },
  };
}
