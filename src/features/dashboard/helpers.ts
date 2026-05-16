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
