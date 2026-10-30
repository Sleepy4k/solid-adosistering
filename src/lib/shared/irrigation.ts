export type { MoistureStatusLabel, Role, Threshold, LiveSprayerData } from "~/types/irrigation";
import type { MoistureStatusLabel, Threshold } from "~/types/irrigation";

export function calculateMoistureStatus(moisturePercent: number, threshold: Threshold): MoistureStatusLabel {
  const dryMax = threshold.displayDryMaxPercent ?? threshold.dryMaxPercent;
  const wetMin = threshold.displayWetMinPercent ?? threshold.wetMinPercent;
  // Same boundaries as the firmware: below dry = Kering, below wet = Lembab.
  if (moisturePercent < dryMax) return "Kering";
  if (moisturePercent >= wetMin) return "Basah";
  return "Lembab";
}

/**
 * Display label for a block key: `Block_B` / `Block-B` read as `Block B` with
 * the first character uppercased. Presentation only; the stored and Firebase
 * keys are never rewritten.
 */
export function formatBlockName(name: string) {
  const label = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : name;
}

/**
 * Sanitizes a value into a Firebase RTDB path segment.
 *
 * Callers must validate region/block names and hardware IDs at the input
 * boundary before reaching this helper; sanitizing is defence-in-depth for
 * legacy rows, not a substitute for validation. Existing data is rewritten
 * rather than rejected here so historical records stay reachable.
 */
export function firebaseSegment(value: string) {
  return value.trim().replace(/[.#$/\[\]]/g, "-");
}

export function toFirebaseControl(mode: "AUTO" | "MANUAL", relay: "OFF" | "ON") {
  return {
    mode,
    pump_status: relay === "ON",
  };
}

export function firebaseSprayerPath(regionName: string, blockName: string, sprayerName: string) {
  return `${firebaseSegment(regionName)}/blocks/${firebaseSegment(blockName)}/${firebaseSegment(sprayerName)}`;
}

export function firebaseBlockPath(regionName: string, blockName: string) {
  return `${firebaseSegment(regionName)}/blocks/${firebaseSegment(blockName)}`;
}

export function firebaseRegionBlocksPath(regionName: string) {
  return `${firebaseSegment(regionName)}/blocks`;
}
