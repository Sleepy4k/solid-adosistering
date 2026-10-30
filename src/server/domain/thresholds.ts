import { MoistureStatus } from "@prisma/client";
import { prisma } from "../db/prisma";

export function defaultThresholdValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePreference(value?: string): MoistureStatus {
  if (value === MoistureStatus.KERING || value === MoistureStatus.BASAH || value === MoistureStatus.LEMBAB)
    return value;
  return MoistureStatus.LEMBAB;
}

export function displayThresholdDefaults(input?: {
  displayDryMaxPercent?: number;
  displayMoistMaxPercent?: number;
  displayWetMinPercent?: number;
}) {
  return {
    displayDryMaxPercent: defaultThresholdValue(input?.displayDryMaxPercent, 40),
    displayMoistMaxPercent: defaultThresholdValue(input?.displayMoistMaxPercent, 70),
    displayWetMinPercent: defaultThresholdValue(input?.displayWetMinPercent, 80),
  };
}

export const SAFETY_TIMEOUT_KEY = "safetyTimeout";

export function safetyTimeoutFromValue(value: unknown, fallback: { min: number; max: number }) {
  const parsed = value as { min?: number; max?: number } | null;
  const min = Number.isFinite(parsed?.min) ? Number(parsed?.min) : fallback.min;
  const max = Number.isFinite(parsed?.max) ? Number(parsed?.max) : fallback.max;
  if (min >= max) return fallback;
  return { min, max };
}

export function normalizeSafetyTimeout(input: { min: number; max: number }) {
  const min = Math.min(10, Math.max(1, Math.round(input.min)));
  const max = Math.min(10, Math.max(1, Math.round(input.max)));
  if (min >= max) throw new Response("Durasi minimum harus lebih kecil dari maksimum.", { status: 400 });
  return { min, max };
}

export async function getSafetyTimeoutDefault() {
  const timeout = await prisma.systemSetting.findUnique({ where: { key: SAFETY_TIMEOUT_KEY } });
  return safetyTimeoutFromValue(timeout?.value, { min: 1, max: 3 });
}

export async function getRegionSafetyTimeoutMap(regionIds: string[], fallback: { min: number; max: number }) {
  const uniqueRegionIds = [...new Set(regionIds)];
  const map = new Map<string, { min: number; max: number }>();
  if (uniqueRegionIds.length === 0) return map;

  const regions = await prisma.region.findMany({
    where: { id: { in: uniqueRegionIds } },
    select: { id: true, safetyTimeoutMin: true, safetyTimeoutMax: true },
  });
  const regionById = new Map(regions.map((region) => [region.id, region]));

  for (const regionId of uniqueRegionIds) {
    const region = regionById.get(regionId);
    map.set(regionId, region ? { min: region.safetyTimeoutMin, max: region.safetyTimeoutMax } : fallback);
  }
  return map;
}

export function displayMoistureStatus(
  moisturePercent: number,
  threshold?: {
    dryMaxPercent: number;
    wetMinPercent: number;
    displayDryMaxPercent?: number;
    displayWetMinPercent?: number;
  } | null,
) {
  const dryMax = threshold?.displayDryMaxPercent ?? threshold?.dryMaxPercent ?? 40;
  const wetMin = threshold?.displayWetMinPercent ?? threshold?.wetMinPercent ?? 80;
  // Same boundaries as the firmware: below dry = Kering, below wet = Lembab.
  if (moisturePercent < dryMax) return MoistureStatus.KERING;
  if (moisturePercent >= wetMin) return MoistureStatus.BASAH;
  return MoistureStatus.LEMBAB;
}

export type RegionThreshold = {
  dryMaxPercent: number;
  wetMinPercent: number;
  displayDryMaxPercent: number;
  displayMoistMaxPercent: number;
  displayWetMinPercent: number;
  landPreference: MoistureStatus;
};

/**
 * Region-wide control values come from `region`; the displayed (label) values
 * stay per user in `indicator_threshold`. The map always contains an entry for
 * every requested region. Database errors are intentionally not swallowed.
 */
export async function getRegionThresholdMap(userId: string, regionIds: string[]) {
  const uniqueRegionIds = [...new Set(regionIds)];
  const map = new Map<string, RegionThreshold>();
  if (uniqueRegionIds.length === 0) return map;

  const [regions, thresholds] = await Promise.all([
    prisma.region.findMany({
      where: { id: { in: uniqueRegionIds } },
      select: { id: true, dryMaxPercent: true, wetMinPercent: true },
    }),
    prisma.indicatorThreshold.findMany({
      where: { userId, regionId: { in: uniqueRegionIds } },
      select: {
        regionId: true,
        displayDryMaxPercent: true,
        displayMoistMaxPercent: true,
        displayWetMinPercent: true,
        landPreference: true,
      },
    }),
  ]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const thresholdByRegion = new Map(thresholds.map((threshold) => [threshold.regionId, threshold]));

  for (const regionId of uniqueRegionIds) {
    const region = regionById.get(regionId);
    const threshold = thresholdByRegion.get(regionId);
    map.set(regionId, {
      dryMaxPercent: region?.dryMaxPercent ?? 40,
      wetMinPercent: region?.wetMinPercent ?? 80,
      ...displayThresholdDefaults(threshold ?? undefined),
      landPreference: normalizePreference(threshold?.landPreference),
    });
  }

  return map;
}
