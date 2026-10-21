import type { MapPoint } from "~/types/map";

export type CoordinateInput = string | number | null | undefined;
export type { MapPoint };

export function decimalCoordinate(value: CoordinateInput, label: "Latitude" | "Longitude") {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Response(`${label} tidak valid.`, { status: 400 });
  if (label === "Latitude" && (parsed < -90 || parsed > 90)) {
    throw new Response("Latitude harus berada di rentang -90 sampai 90.", { status: 400 });
  }
  if (label === "Longitude" && (parsed < -180 || parsed > 180)) {
    throw new Response("Longitude harus berada di rentang -180 sampai 180.", { status: 400 });
  }
  return text;
}

/** Serialize a Prisma Decimal (or any decimal-like value) for a JSON DTO. */
export function decimalToString(value: { toString(): string } | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.toString();
  return text === "NaN" ? null : text;
}

export function pointIsValid(point: MapPoint) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

export function pointsToPolygonGeojson(points: MapPoint[]) {
  if (points.length === 0) return null;
  if (points.length < 3) throw new Response("Polygon membutuhkan minimal 3 titik koordinat.", { status: 400 });
  if (!points.every(pointIsValid)) throw new Response("Koordinat polygon tidak valid.", { status: 400 });
  const coordinates = points.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  return { type: "Polygon", coordinates: [coordinates] };
}
