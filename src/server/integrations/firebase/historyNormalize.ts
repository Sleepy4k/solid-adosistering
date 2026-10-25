import { IrrigationMode, type RelayState } from "@prisma/client";
import { addJakartaDays, jakartaDateKey } from "~/lib/shared/datetime";
import { clampNumber, fromEpoch, moistureStatus, relayState } from "./convert";

type RawHistoryEntry = {
  duration?: unknown;
  endtime?: unknown;
  flow_Lmin?: unknown;
  mode?: unknown;
  moisture_percent?: unknown;
  moisture_status?: unknown;
  pump_status?: unknown;
  starttime?: unknown;
  timestamp?: unknown;
  totalVolume?: unknown;
};

export type NormalizedHistoryEntry = {
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  totalVolumeLiter: number | null;
  mode: IrrigationMode;
  relay: RelayState;
  recordedAt: Date;
  moisturePercent: number;
  flowLmin: number;
  moistureStatus: ReturnType<typeof moistureStatus>;
};

/** Device clocks before this are unset/reset RTC values, not real instants. */
const MIN_EPOCH_SECONDS = 946_684_800; // 2000-01-01
const FUTURE_TOLERANCE_SECONDS = 7 * 24 * 60 * 60;
/** A single irrigation session longer than a day is a firmware glitch. */
const MAX_SESSION_SECONDS = 24 * 60 * 60;

function validEpoch(value: unknown, nowSeconds: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_EPOCH_SECONDS || value > nowSeconds + FUTURE_TOLERANCE_SECONDS) return null;
  return Math.floor(value);
}

function validDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_SESSION_SECONDS) return null;
  return Math.round(value);
}

/**
 * Turn one raw history node into trustworthy values, or `null` when it has no
 * usable instant at all.
 *
 * Observed firmware faults this guards against: `starttime`/`duration`
 * swapped (`starttime: 3`, `duration: <epoch>`), so an implausible start would
 * otherwise become a 1970 event with a billion-second duration, and values
 * outside the column ranges.
 */
export function normalizeHistoryEntry(entry: RawHistoryEntry, nowSeconds: number): NormalizedHistoryEntry | null {
  const endSec = validEpoch(entry.endtime, nowSeconds);
  const stampSec = validEpoch(entry.timestamp, nowSeconds);
  const reportedDuration = validDuration(entry.duration);

  let startSec = validEpoch(entry.starttime, nowSeconds);
  // Swapped fields: the epoch landed in `duration`, the duration in `starttime`.
  if (startSec === null) {
    const swapped = validEpoch(entry.duration, nowSeconds);
    if (swapped !== null && (endSec === null || swapped <= endSec)) startSec = swapped;
  }

  const finishSec = endSec ?? stampSec;
  if (startSec === null) {
    if (finishSec !== null && reportedDuration !== null) startSec = finishSec - reportedDuration;
    else startSec = finishSec;
  }
  if (startSec === null) return null;

  const endedSec = finishSec !== null && finishSec >= startSec ? finishSec : null;
  const measured = endedSec !== null ? endedSec - startSec : null;
  const durationSeconds =
    measured !== null && measured > 0 && measured <= MAX_SESSION_SECONDS ? measured : reportedDuration;

  const volume = typeof entry.totalVolume === "number" && Number.isFinite(entry.totalVolume) ? entry.totalVolume : null;
  const totalVolumeLiter = volume !== null && volume >= 0 ? clampNumber(volume, 0, 9_999_999_999) : null;

  // `flow_Lmin` is not reliable on these devices: derive the average rate from
  // the volume and the duration, falling back to whatever the device sent.
  const derivedFlow =
    totalVolumeLiter !== null && durationSeconds !== null && durationSeconds > 0
      ? totalVolumeLiter / (durationSeconds / 60)
      : clampNumber(entry.flow_Lmin, 0, 999_999);

  return {
    startedAt: fromEpoch(startSec),
    endedAt: endedSec !== null ? fromEpoch(endedSec) : null,
    durationSeconds,
    totalVolumeLiter,
    mode: entry.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
    // Every history node is a completed irrigation run. `pump_status` there is
    // the state when the run was recorded (already off), so it cannot be used.
    relay: relayState(true),
    recordedAt: fromEpoch(stampSec ?? endedSec ?? startSec),
    moisturePercent: clampNumber(entry.moisture_percent, 0, 100),
    flowLmin: clampNumber(derivedFlow, 0, 999_999),
    moistureStatus: moistureStatus(typeof entry.moisture_status === "string" ? entry.moisture_status : undefined),
  };
}

/** Firebase date node for an instant: WIB calendar day as `DDMMYYYY`. */
export function historyDateKey(value: Date): string {
  const [year, month, day] = jakartaDateKey(value).split("-");
  return `${day}${month}${year}`;
}

/** Date nodes that can still receive entries: today and yesterday in WIB. */
export function recentHistoryDateKeys(now = new Date()): string[] {
  return [historyDateKey(now), historyDateKey(addJakartaDays(now, -1))];
}
