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
