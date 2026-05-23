export type MoistureStatusLabel = "Kering" | "Lembab" | "Basah";

export type Role = "SUPERADMIN" | "ADMIN" | "USER";

export type Threshold = {
  dryMaxPercent: number;
  wetMinPercent: number;
  displayDryMaxPercent?: number;
  displayMoistMaxPercent?: number;
  displayWetMinPercent?: number;
  volumeDivider?: number;
};

export type LiveSprayerData = {
  regionName: string;
  blockName: string;
  sprayerId: string;
  flowLmin: number;
  moisturePercent: number;
  moistureStatus: MoistureStatusLabel;
  pumpStatus: string;
  pumpOn: boolean;
  totalVolumeLiter: number;
  windDirection: string | null;
  lastUpdated: number | null;
  mode: 0 | 1;
  relay: 0 | 1;
};

export function calculateMoistureStatus(moisturePercent: number, threshold: Threshold): MoistureStatusLabel {
  const dryMax = threshold.displayDryMaxPercent ?? threshold.dryMaxPercent;
  const wetMin = threshold.displayWetMinPercent ?? threshold.wetMinPercent;
  if (moisturePercent <= dryMax) return "Kering";
  if (moisturePercent >= wetMin) return "Basah";
  return "Lembab";
}

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
