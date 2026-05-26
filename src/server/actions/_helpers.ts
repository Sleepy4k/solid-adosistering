import { type ActivityAction, MoistureStatus, type Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { syncFirebaseSnapshotToDatabase } from "../services/firebaseSync";
import { prisma } from "../db/prisma";
import type { SessionUser } from "../security";
import type { MapPoint } from "~/types/map";

export type CoordinateInput = string | number | null | undefined;
export type { MapPoint };

export async function logActivity(input: {
  actorId?: string;
  regionId?: string;
  blockId?: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.activityLog.create({
    data: {
      actorId: input.actorId === "system" ? undefined : input.actorId,
      regionId: input.regionId,
      blockId: input.blockId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}

export async function refreshFirebaseCache() {
  try {
    await syncFirebaseSnapshotToDatabase();
  } catch {}
}

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

export async function getScopedRegionIds(session: SessionUser): Promise<string[] | null> {
  if (session.role === "SUPERADMIN") return null;
  if (session.role === "ADMIN") {
    const rows = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      select: { regionId: true },
    });
    return rows.map((row) => row.regionId);
  }
  const rows = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    select: { regionId: true },
  });
  return rows.map((row) => row.regionId);
}

export async function getScopedBlockIds(session: SessionUser, requestedBlockId?: string): Promise<string[]> {
  const regionIds = await getScopedRegionIds(session);
  const where: Prisma.BlockWhereInput = {
    ...(requestedBlockId ? { id: requestedBlockId } : {}),
    ...(regionIds ? { regionId: { in: regionIds } } : {}),
  };
  const blocks = await prisma.block.findMany({ where, select: { id: true } });
  return blocks.map((block) => block.id);
}

export async function assertRegionsAssignable(session: SessionUser, regionIds: string[], role: Role) {
  const uniqueIds = [...new Set(regionIds.filter(Boolean))];
  if (role === "USER" && uniqueIds.length !== 1) {
    throw new Response("User wajib di-assign tepat 1 region.", { status: 400 });
  }
  if (role === "ADMIN" && session.role === "SUPERADMIN" && uniqueIds.length === 0) {
    throw new Response("Admin wajib memiliki minimal 1 region.", { status: 400 });
  }
  if (session.role === "ADMIN") {
    if (role !== "USER") throw new Response("Admin hanya dapat membuat atau mengubah role User.", { status: 403 });
    const adminRegionIds = await getScopedRegionIds(session);
    if (!adminRegionIds || uniqueIds.some((id) => !adminRegionIds.includes(id))) {
      throw new Response("Region berada di luar hak akses admin.", { status: 403 });
    }
  }
  return uniqueIds;
}

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
  if (regionIds.length === 0) return new Map<string, { min: number; max: number }>();
  const keys = regionIds.map((regionId) => `${SAFETY_TIMEOUT_KEY}:${regionId}`);
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map<string, { min: number; max: number }>();
  for (const setting of settings) {
    const regionId = setting.key.slice(SAFETY_TIMEOUT_KEY.length + 1);
    if (!regionId) continue;
    map.set(regionId, safetyTimeoutFromValue(setting.value, fallback));
  }
  for (const regionId of regionIds) {
    if (!map.has(regionId)) map.set(regionId, fallback);
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
  if (moisturePercent <= dryMax) return MoistureStatus.KERING;
  if (moisturePercent >= wetMin) return MoistureStatus.BASAH;
  return MoistureStatus.LEMBAB;
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

export async function getRegionThresholdMap(userId: string, regionIds: string[]) {
  try {
    const thresholds = await prisma.indicatorThreshold.findMany({
      where: { userId, regionId: { in: regionIds } },
      select: {
        regionId: true,
        dryMaxPercent: true,
        wetMinPercent: true,
        displayDryMaxPercent: true,
        displayMoistMaxPercent: true,
        displayWetMinPercent: true,
        landPreference: true,
      },
    });
    return new Map(thresholds.map((threshold) => [threshold.regionId, threshold]));
  } catch {
    return new Map<
      string,
      {
        dryMaxPercent: number;
        wetMinPercent: number;
        displayDryMaxPercent: number;
        displayMoistMaxPercent: number;
        displayWetMinPercent: number;
        landPreference: MoistureStatus;
      }
    >();
  }
}

export function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0 && rest > 0) return `${minutes} menit ${rest} detik`;
  if (minutes > 0) return `${minutes} menit`;
  return `${rest} detik`;
}

export function cooldownResponse(retryAfterSec: number) {
  return new Response(`Terlalu banyak percobaan login. Coba lagi dalam ${formatCooldown(retryAfterSec)}.`, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSec) },
  });
}

export function invalidCredentialsResponse(remaining: number) {
  const suffix = remaining > 0 ? ` Sisa ${remaining} percobaan sebelum penguncian sementara.` : "";
  return new Response(`Kredensial tidak valid.${suffix}`, { status: 401 });
}
