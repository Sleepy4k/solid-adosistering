import { createHash } from "node:crypto";
import { MoistureStatus, RelayState } from "@prisma/client";

/**
 * Stable, bounded key for `sensor_reading.source_key` (VARCHAR(191)).
 * SHA-256 hex is 64 chars, so it always fits.
 */
export function stableSourceKey(...parts: Array<string | number>) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function fromEpoch(seconds?: number) {
  return new Date((seconds ?? Math.floor(Date.now() / 1000)) * 1000);
}

export function numberOrZero(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/** Finite number clamped into `[min, max]`; anything else becomes `fallback`. */
export function clampNumber(value: unknown, min: number, max: number, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function moistureStatus(value?: string): MoistureStatus {
  const normalized = value?.toLowerCase();
  if (normalized === "basah") return MoistureStatus.BASAH;
  if (normalized === "lembab") return MoistureStatus.LEMBAB;
  return MoistureStatus.KERING;
}

/**
 * Soil moisture class from the percentage, with the firmware's boundaries
 * (`moistureToStatus`): below the dry limit is Kering, below the wet limit is
 * Lembab, otherwise Basah. The firmware never writes `moisture_status` into
 * `live_data`, so a stored label there would be stale; always classify.
 */
export function moistureFromPercent(percent: number, dryLimit: number, wetLimit: number): MoistureStatus {
  if (percent < dryLimit) return MoistureStatus.KERING;
  if (percent < wetLimit) return MoistureStatus.LEMBAB;
  return MoistureStatus.BASAH;
}

export function relayState(value?: boolean): RelayState {
  return value ? RelayState.ON : RelayState.OFF;
}

/**
 * The devices report the cumulative liter counter as `total_liter`. The older
 * `totalVolume` key is kept as a fallback for nodes provisioned earlier.
 */
export function liveTotalLiter(live: { total_liter?: unknown; totalVolume?: unknown }): number | null {
  const raw = live.total_liter ?? live.totalVolume;
  if (raw === undefined || raw === null) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
