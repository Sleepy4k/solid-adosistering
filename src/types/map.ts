import type { Prisma } from "@prisma/client";

export type MapPoint = { lat: number; lng: number };
export type MapConfig = { lat: number; lng: number; zoom: number };
export type MapDisplayConfig = { basahColor: string; keringColor: string; lembabColor: string };
export type MapWorkspace = MapConfig & {
  regions: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    blocks: { id: string; name: string; polygonGeojson: Prisma.JsonValue | null }[];
  }[];
};
