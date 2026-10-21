import type { Prisma } from "@prisma/client";

export type MapPoint = { lat: number; lng: number };
export type MapConfig = { lat: number; lng: number; zoom: number };
export type MapDisplayConfig = { basahColor: string; keringColor: string; lembabColor: string };

export type MapSyncStatus = "PENDING" | "SYNCED" | "FAILED";

export type MapBlock = {
  id: string;
  name: string;
  polygonGeojson: Prisma.JsonValue | null;
  areaHectare: string | null;
  firebaseSyncStatus: MapSyncStatus;
};

export type MapRegion = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  blocks: MapBlock[];
};

export type MapWorkspace = MapConfig & {
  regions: MapRegion[];
};

/** Plain, serializable result of creating a block (no Decimal or Date fields). */
export type BlockCreateResult = {
  id: string;
  regionId: string;
  name: string;
  areaHectare: string | null;
  firebaseSyncStatus: MapSyncStatus;
};
