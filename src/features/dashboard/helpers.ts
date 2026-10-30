import type { LiveSprayerData } from "~/lib/shared/irrigation";
import { calculateMoistureStatus, type Threshold } from "~/lib/shared/irrigation";
import { formatJakartaDateTime } from "~/lib/shared/datetime";

export function pumpBadgeTone(status: string) {
  return status === "ON" || status === "AKTIF" || status === "Aktif" ? "success" : "danger";
}

export function moistureTone(moisture: number, threshold?: Threshold | null) {
  const label = calculateMoistureStatus(moisture, threshold ?? { dryMaxPercent: 40, wetMinPercent: 80 });
  if (label === "Kering") return { label, tone: "warning" as const };
  if (label === "Basah") return { label, tone: "info" as const };
  return { label, tone: "success" as const };
}

export function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/**
 * A live reading older than this is treated as offline. The firmware writes
 * `last_updated` every few seconds and itself closes valves after 120 s without
 * a readable control node, so two minutes without a heartbeat means offline.
 */
export const LIVE_STALE_MS = 120_000;
/** Tolerated device clock drift into the future before a reading is rejected. */
export const CLOCK_SKEW_MS = 60_000;

export type LiveStatus = "unknown" | "never" | "offline" | "watering" | "no-flow" | "idle";

/**
 * Derive a defensible device status from the last Firebase snapshot.
 *
 * `lastUpdated` is normally epoch seconds, but older firmware has written
 * milliseconds; values above 1e12 are treated as milliseconds. Physical flow
 * wins over the commanded pump state, so a closed tap still reads as watering
 * when water is actually moving.
 */
export function deriveLiveStatus(data: LiveSprayerData | null, nowMs: number, monitorError = false): LiveStatus {
  if (monitorError) return "unknown";
  const raw = data?.lastSeen ?? data?.lastUpdated;
  if (!data || raw == null) return "never";

  const timestampMs = raw > 1e12 ? raw : raw * 1000;
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "never";
  if (timestampMs - nowMs > CLOCK_SKEW_MS) return "offline";
  if (nowMs - timestampMs > LIVE_STALE_MS) return "offline";

  // A missing/NaN flow is not a measurement, so it must not read as idle or
  // "no-flow". Positive flow keeps precedence for firmware that sends a string.
  const flowLmin = Number(data.flowLmin);
  if (!Number.isFinite(flowLmin)) return "unknown";
  if (flowLmin > 0) return "watering";
  if (data.pumpOn) return "no-flow";
  return "idle";
}

export function liveStatusMeta(status: LiveStatus): {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "muted";
} {
  switch (status) {
    case "watering":
      return { label: "Menyiram", tone: "success" };
    case "no-flow":
      return { label: "Pompa Aktif, Tanpa Aliran", tone: "warning" };
    case "offline":
      return { label: "Tidak Mengirim Data", tone: "danger" };
    case "idle":
      return { label: "Siaga", tone: "info" };
    case "never":
      return { label: "Belum Ada Data", tone: "muted" };
    default:
      return { label: "Pemantauan Tidak Tersedia", tone: "muted" };
  }
}

/**
 * Absolute WIB timestamp such as `Selasa, 20/10/2026 18:42 WIB`; `Date` values
 * are milliseconds. Numbers are epoch seconds, but legacy firmware wrote
 * milliseconds, so values above 1e12 are milliseconds (the same rule
 * `deriveLiveStatus` uses).
 */
export function formatLastUpdated(value: Date | number | null) {
  if (!value) return "Belum ada data";
  const time = typeof value === "number" ? (value > 1e12 ? value : value * 1000) : value.getTime();
  if (!Number.isFinite(time)) return "Belum ada data";
  return formatJakartaDateTime(new Date(time));
}

export function aggregateLive(sprayers: LiveSprayerData[]) {
  return {
    avgMoisture: average(sprayers.map((item) => item.moisturePercent)),
    avgFlow: average(sprayers.map((item) => item.flowLmin)),
    totalVolume: sprayers.reduce((sum, item) => sum + item.totalVolumeLiter, 0),
  };
}

export function syncTone(status: string): "success" | "warning" | "danger" {
  if (status === "SYNCED") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}

export function syncLabel(status: string) {
  if (status === "SYNCED") return "Tersinkron";
  if (status === "FAILED") return "Gagal";
  return "Menunggu";
}

export function pointsFromGeojson(value: unknown): [number, number][] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: string; coordinates?: unknown };
  const coordinates =
    geo.type === "Polygon" && Array.isArray(geo.coordinates)
      ? geo.coordinates[0]
      : Array.isArray(geo.coordinates)
        ? geo.coordinates
        : [];
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as [number, number]) : null;
    })
    .filter((point): point is [number, number] => Boolean(point));
}

export function colorForIndex(index: number) {
  return ["#3b82f6", "#67B744", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5] ?? "#3b82f6";
}

export function colorForStatus(
  status: string | undefined,
  colors: { basahColor: string; keringColor: string; lembabColor: string },
) {
  if (status === "Kering") return colors.keringColor;
  if (status === "Basah") return colors.basahColor;
  if (status === "Lembab") return colors.lembabColor;
  return null;
}
