export type MoistureStatusLabel = "Kering" | "Lembab" | "Basah";

export type Role = "SUPERADMIN" | "ADMIN" | "USER";

export type Threshold = {
  dryMaxPercent: number;
  wetMinPercent: number;
};

export type LiveSprayerData = {
  regionName: string;
  blockName: string;
  sprayerId: string;
  flowLmin: number;
  moisturePercent: number;
  moistureStatus: MoistureStatusLabel;
  pumpStatus: string;
  mode: 0 | 1;
  relay: 0 | 1;
};

export function calculateMoistureStatus(moisturePercent: number, threshold: Threshold): MoistureStatusLabel {
  if (moisturePercent <= threshold.dryMaxPercent) return "Kering";
  if (moisturePercent >= threshold.wetMinPercent) return "Basah";
  return "Lembab";
}

export function firebaseSegment(value: string) {
  return value.trim().replace(/[.#$/\[\]]/g, "-");
}

export function toFirebaseControl(mode: "AUTO" | "MANUAL", relay: "OFF" | "ON") {
  return {
    mode: mode === "AUTO" ? 0 : 1,
    relay: relay === "ON" ? 1 : 0,
    sprayer: relay === "ON" ? 1 : 0,
  };
}
