import type { MoistureStatus, Prisma } from "@prisma/client";

export type DashboardRegion = {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  volumeDivider: number;
  showWindDirection: boolean;
  showAutoIrrigation: boolean;
  threshold: {
    dryMaxPercent: number;
    wetMinPercent: number;
    displayDryMaxPercent: number;
    displayMoistMaxPercent: number;
    displayWetMinPercent: number;
    landPreference: MoistureStatus;
  } | null;
  blocks: {
    id: string;
    name: string;
    polygonGeojson: Prisma.JsonValue | null;
    sprayers: { id: string; hardwareId: string; displayName: string }[];
  }[];
};

export type AdminUserCard = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  city: string | null;
  domicile: string | null;
  regions: { id: string; name: string }[];
  sprayersByBlock: {
    regionName: string;
    blockName: string;
    hardwareId: string;
    sprayerId: string;
    volumeDivider: number;
    threshold: {
      dryMaxPercent: number;
      wetMinPercent: number;
      displayDryMaxPercent: number;
      displayMoistMaxPercent: number;
      displayWetMinPercent: number;
    } | null;
  }[];
};

export type SuperadminSummary = {
  totalRegions: number;
  totalBlocks: number;
  totalAdmins: number;
  totalUsers: number;
  regions: {
    id: string;
    name: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    blockCount: number;
    adminCount: number;
    syncStatus: string;
  }[];
};
