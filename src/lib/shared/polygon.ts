import type { MapPoint } from "~/types/map";

/**
 * Editable polygon row. Coordinates stay strings so partially typed values
 * (for example "-" or "109.") survive the round trip through the input.
 */
export type PolygonRow = {
  id: string;
  lat: string;
  lng: string;
};

export type PolygonRowError = {
  lat?: string;
  lng?: string;
  row?: string;
};

export type PolygonRowsValidation = {
  /** Parsed points in ring order, without the trailing closure vertex. */
  points: MapPoint[];
  errors: Record<string, PolygonRowError>;
  formError: string;
  hasInput: boolean;
  valid: boolean;
};

export const POLYGON_MIN_POINTS = 3;
export const POLYGON_MAX_POINTS = 500;
/** Degenerate rings smaller than this (square degrees) are rejected as zero-area. */
export const POLYGON_MIN_AREA_DEGREES2 = 1e-12;

/**
 * Strict decimal grammar: optional sign, digits with an optional fraction, or
 * a leading-dot fraction. Deliberately rejects `1e3`, `0x10`, `Infinity`, and
 * `NaN` so a typo cannot silently become a valid but unintended coordinate.
 */
const COORDINATE_GRAMMAR = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

const EMPTY_ROW_ERROR = "Baris titik tidak boleh kosong di tengah daftar.";

export function parseCoordinate(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !COORDINATE_GRAMMAR.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return "";
  const text = value.toString();
  if (!/e/i.test(text)) return text;
  // Expand scientific notation (e.g. 1e-7) so the row stays inside the strict
  // decimal grammar when it is rendered back into an input.
  return value.toFixed(20).replace(/\.?0+$/, "");
}

export function pointsFromGeojson(value: unknown): MapPoint[] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: unknown; coordinates?: unknown };
  const ring =
    geo.type === "Polygon" && Array.isArray(geo.coordinates) && Array.isArray(geo.coordinates[0])
      ? geo.coordinates[0]
      : Array.isArray(geo.coordinates)
        ? geo.coordinates
        : [];
  if (!Array.isArray(ring)) return [];

  const points: MapPoint[] = [];
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = point[0];
    const lat = point[1];
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
  }
  return points;
}

/** Drop the GeoJSON closure vertex so edits never show a duplicated last row. */
export function normalizePolygonPoints(points: MapPoint[]): MapPoint[] {
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) return points.slice(0, -1);
  }
  return points.slice();
}

/** Deterministic ids (`p0`, `p1`, ...) keep SSR and hydration output stable. */
export function pointsToRows(points: MapPoint[], idPrefix = "p"): PolygonRow[] {
  return normalizePolygonPoints(points).map((point, index) => ({
    id: `${idPrefix}${index}`,
    lat: formatCoordinate(point.lat),
    lng: formatCoordinate(point.lng),
  }));
}

export function blankPolygonRows(count = POLYGON_MIN_POINTS): PolygonRow[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    id: `p${index}`,
    lat: "",
    lng: "",
  }));
}

export function hasDuplicateVertices(points: MapPoint[]): boolean {
  const seen = new Set<string>();
  for (const point of normalizePolygonPoints(points)) {
    const key = `${point.lat}:${point.lng}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Planar shoelace area in square degrees. Coordinates are lon/lat on a plane,
 * which is enough to reject a collapsed ring before it reaches Leaflet.
 */
export function polygonAreaDegrees2(points: MapPoint[]): number {
  const ring = normalizePolygonPoints(points);
  if (ring.length < POLYGON_MIN_POINTS) return 0;
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    sum += current.lng * next.lat - next.lng * current.lat;
  }
  return Math.abs(sum) / 2;
}

export function rowsToPoints(rows: PolygonRow[]): MapPoint[] {
  const points: MapPoint[] = [];
  for (const row of rows) {
    const lat = parseCoordinate(row.lat);
    const lng = parseCoordinate(row.lng);
    if (lat === null || lng === null) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
  }
  return normalizePolygonPoints(points);
}

function firstRowMessage(rows: PolygonRow[], errors: Record<string, PolygonRowError>): string {
  for (let index = 0; index < rows.length; index += 1) {
    const error = errors[rows[index].id];
    if (!error) continue;
    const detail = error.row ?? error.lat ?? error.lng ?? "Koordinat tidak valid.";
    return `Titik ${index + 1}: ${detail}`;
  }
  return "Periksa kembali koordinat titik yang ditandai.";
}

function duplicatedRowErrors(rows: PolygonRow[], points: MapPoint[]): Record<string, PolygonRowError> {
  // Null-prototype map so a row id such as `__proto__` cannot mutate the
  // prototype chain and silently swallow its own error entry.
  const errors = Object.create(null) as Record<string, PolygonRowError>;
  const seen = new Set<string>();
  points.forEach((point, index) => {
    const key = `${point.lat}:${point.lng}`;
    if (seen.has(key) && rows[index]) {
      errors[rows[index].id] = { row: "Titik duplikat dengan titik sebelumnya." };
    }
    seen.add(key);
  });
  return errors;
}

/**
 * Validate the editor rows. Blank rows at the end are ignored, blank rows in the
 * middle are errors, and the ring must contain at least three unique vertices
 * with a non-zero area.
 */
export function validatePolygonRows(rows: PolygonRow[]): PolygonRowsValidation {
  const trimmed = rows.map((row) => ({ lat: row.lat.trim(), lng: row.lng.trim() }));
  const errors = Object.create(null) as Record<string, PolygonRowError>;
  const points: MapPoint[] = [];

  let lastNonEmptyIndex = -1;
  trimmed.forEach((row, index) => {
    if (row.lat || row.lng) lastNonEmptyIndex = index;
  });

  if (lastNonEmptyIndex === -1) {
    return {
      points: [],
      errors: Object.create(null) as Record<string, PolygonRowError>,
      formError: "Polygon membutuhkan minimal 3 titik.",
      hasInput: false,
      valid: false,
    };
  }

  trimmed.forEach((row, index) => {
    const isEmpty = !row.lat && !row.lng;
    if (isEmpty) {
      if (index < lastNonEmptyIndex) errors[rows[index].id] = { row: EMPTY_ROW_ERROR };
      return;
    }

    const rowError: PolygonRowError = {};
    const lat = parseCoordinate(row.lat);
    const lng = parseCoordinate(row.lng);

    if (!row.lat) rowError.lat = "Latitude wajib diisi.";
    else if (lat === null) rowError.lat = "Format latitude tidak valid.";
    else if (lat < -90 || lat > 90) rowError.lat = "Latitude harus di antara -90 dan 90.";

    if (!row.lng) rowError.lng = "Longitude wajib diisi.";
    else if (lng === null) rowError.lng = "Format longitude tidak valid.";
    else if (lng < -180 || lng > 180) rowError.lng = "Longitude harus di antara -180 dan 180.";

    if (rowError.lat || rowError.lng) {
      errors[rows[index].id] = rowError;
      return;
    }

    points.push({ lat: lat as number, lng: lng as number });
  });

  if (Object.keys(errors).length > 0) {
    return {
      points,
      errors,
      formError: firstRowMessage(rows, errors),
      hasInput: true,
      valid: false,
    };
  }

  const normalized = normalizePolygonPoints(points);

  if (normalized.length > POLYGON_MAX_POINTS) {
    return {
      points: normalized,
      errors,
      formError: `Polygon maksimal ${POLYGON_MAX_POINTS} titik.`,
      hasInput: true,
      valid: false,
    };
  }

  if (normalized.length < POLYGON_MIN_POINTS) {
    return {
      points: normalized,
      errors,
      formError: `Polygon membutuhkan minimal ${POLYGON_MIN_POINTS} titik.`,
      hasInput: true,
      valid: false,
    };
  }

  const duplicateErrors = duplicatedRowErrors(rows, normalized);
  if (Object.keys(duplicateErrors).length > 0) {
    return {
      points: normalized,
      errors: duplicateErrors,
      formError: "Polygon memiliki titik koordinat duplikat.",
      hasInput: true,
      valid: false,
    };
  }

  if (polygonAreaDegrees2(normalized) <= POLYGON_MIN_AREA_DEGREES2) {
    return {
      points: normalized,
      errors,
      formError: "Polygon tidak memiliki luas yang valid (titik-titik segaris).",
      hasInput: true,
      valid: false,
    };
  }

  return { points: normalized, errors, formError: "", hasInput: true, valid: true };
}
