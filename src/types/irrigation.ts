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
  /** Cumulative counter reported by the device (`total_liter`), 0 when the device has none. */
  totalVolumeLiter: number;
  /** True when the device reports a cumulative counter; otherwise volume is derived from flow. */
  hasVolumeCounter: boolean;
  /** Liters integrated from `flow_Lmin` since this page started watching (derived volume only). */
  sessionVolumeLiter: number;
  windDirection: string | null;
  /** `live_data.last_updated`: the latest watering update. */
  lastUpdated: number | null;
  /** Newest device timestamp (`last_updated` / `last_update`); drives the offline check. */
  lastSeen: number | null;
  mode: 0 | 1;
  relay: 0 | 1;
};
