import type { LiveSprayerData } from "~/lib/shared/irrigation";
import { calculateMoistureStatus, type Threshold } from "~/lib/shared/irrigation";

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

export function formatLastUpdated(value: Date | number | null) {
  if (!value) return "Belum ada data";
  const time = typeof value === "number" ? value * 1000 : value.getTime();
  const diff = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diff < 60) return `${diff} detik yang lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
  return `${Math.floor(diff / 3600)} jam yang lalu`;
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
