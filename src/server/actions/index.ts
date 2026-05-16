"use server";

import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { ActivityAction, IrrigationMode, MoistureStatus, Prisma, RelayState, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendPasswordResetEmail } from "../email";
import {
  provisionBlockNode,
  provisionRegionNode,
  provisionSprayerNode,
  renameBlockNode,
  renameRegionNode,
  updateRegionSettings,
  updateSprayerControl,
} from "../services/firebaseSync";
import { serverConfig } from "../config";
import {
  assertAdminOrHigher,
  assertSuperadmin,
  hashPassword,
  hashToken,
  newOpaqueToken,
  verifyPassword,
  type SessionUser,
} from "../security";
import { createSession, destroySession, getSession } from "../session";

// ── helpers ──────────────────────────────────────────────────────────────────

async function logActivity(input: {
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

type CoordinateInput = string | number | null | undefined;

function decimalCoordinate(value: CoordinateInput, label: "Latitude" | "Longitude") {
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

async function getScopedRegionIds(session: SessionUser): Promise<string[] | null> {
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

async function getScopedBlockIds(session: SessionUser, requestedBlockId?: string): Promise<string[]> {
  const regionIds = await getScopedRegionIds(session);
  const where: Prisma.BlockWhereInput = {
    ...(requestedBlockId ? { id: requestedBlockId } : {}),
    ...(regionIds ? { regionId: { in: regionIds } } : {}),
  };
  const blocks = await prisma.block.findMany({ where, select: { id: true } });
  return blocks.map((block) => block.id);
}

async function assertRegionsAssignable(session: SessionUser, regionIds: string[], role: Role) {
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

function defaultThresholdValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePreference(value?: string): MoistureStatus {
  if (value === MoistureStatus.KERING || value === MoistureStatus.BASAH || value === MoistureStatus.LEMBAB)
    return value;
  return MoistureStatus.LEMBAB;
}

function displayThresholdDefaults(input?: {
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

function displayMoistureStatus(
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

function pointIsValid(point: MapPoint) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function pointsToPolygonGeojson(points: MapPoint[]) {
  if (points.length === 0) return null;
  if (points.length < 3) throw new Response("Polygon membutuhkan minimal 3 titik koordinat.", { status: 400 });
  if (!points.every(pointIsValid)) throw new Response("Koordinat polygon tidak valid.", { status: 400 });

  const coordinates = points.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  return { type: "Polygon", coordinates: [coordinates] };
}

async function getRegionThresholdMap(userId: string, regionIds: string[]) {
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

// ── auth ─────────────────────────────────────────────────────────────────────

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
  });

  if (!user || !user.isActive) throw new Response("Kredensial tidak valid", { status: 401 });

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new Response("Kredensial tidak valid", { status: 401 });

  await createSession(user.id);
  await logActivity({
    actorId: user.id,
    action: ActivityAction.AUTH_LOGIN,
    entityType: "User",
    entityId: user.id,
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await logActivity({
      actorId: session.id,
      action: ActivityAction.AUTH_LOGOUT,
      entityType: "User",
      entityId: session.id,
    });
  }
  await destroySession();
  return { ok: true };
}

// ── dashboard data ────────────────────────────────────────────────────────────

export type DashboardRegion = {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
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
  primarySprayer: { regionName: string; blockName: string; hardwareId: string } | null;
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
    blockCount: number;
    adminCount: number;
    syncStatus: string;
  }[];
};

export async function getMyDashboard(): Promise<
  | { type: "superadmin"; summary: SuperadminSummary }
  | { type: "user"; regions: DashboardRegion[] }
  | { type: "admin"; users: AdminUserCard[] }
> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  if (session.role === "SUPERADMIN") {
    const [totalRegions, totalBlocks, totalAdmins, totalUsers, regions] = await Promise.all([
      prisma.region.count(),
      prisma.block.count(),
      prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
      prisma.user.count({ where: { role: "USER", isActive: true } }),
      prisma.region.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          firebaseSyncStatus: true,
          _count: { select: { blocks: true, adminAssignments: true } },
        },
      }),
    ]);
    return {
      type: "superadmin",
      summary: {
        totalRegions,
        totalBlocks,
        totalAdmins,
        totalUsers,
        regions: regions.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          blockCount: r._count.blocks,
          adminCount: r._count.adminAssignments,
          syncStatus: r.firebaseSyncStatus,
        })),
      },
    };
  }

  if (session.role === "USER") {
    const assignments = await prisma.userRegionAssignment.findMany({
      where: { userId: session.id },
      include: {
        region: {
          include: {
            blocks: {
              orderBy: { name: "asc" },
              include: {
                sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
              },
            },
          },
        },
      },
    });
    const thresholdMap = await getRegionThresholdMap(
      session.id,
      assignments.map((assignment) => assignment.regionId),
    );

    return {
      type: "user",
      regions: assignments.map((assignment) => {
        const region = assignment.region;
        const threshold = thresholdMap.get(region.id) ?? null;
        return {
          id: region.id,
          name: region.name,
          description: region.description,
          latitude: region.latitude ? Number(region.latitude) : null,
          longitude: region.longitude ? Number(region.longitude) : null,
          threshold: threshold
            ? {
                dryMaxPercent: threshold.dryMaxPercent,
                wetMinPercent: threshold.wetMinPercent,
                displayDryMaxPercent: threshold.displayDryMaxPercent,
                displayMoistMaxPercent: threshold.displayMoistMaxPercent,
                displayWetMinPercent: threshold.displayWetMinPercent,
                landPreference: threshold.landPreference,
              }
            : null,
          blocks: region.blocks.map((block) => ({
            id: block.id,
            name: block.name,
            polygonGeojson: block.polygonGeojson,
            sprayers: block.sprayers.map((sprayer) => ({
              id: sprayer.id,
              hardwareId: sprayer.hardwareId,
              displayName: sprayer.displayName,
            })),
          })),
        };
      }),
    };
  }

  const adminRegionIds = session.role === "ADMIN" ? await getScopedRegionIds(session) : null;
  if (adminRegionIds && adminRegionIds.length === 0) return { type: "admin", users: [] };

  const users = await prisma.user.findMany({
    where: {
      role: "USER",
      ...(adminRegionIds ? { assignedRegions: { some: { regionId: { in: adminRegionIds } } } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      profile: { select: { city: true, domicile: true } },
      assignedRegions: {
        include: {
          region: {
            include: {
              blocks: {
                take: 1,
                orderBy: { name: "asc" },
                include: { sprayers: { take: 1, where: { isActive: true }, orderBy: { createdAt: "asc" } } },
              },
            },
          },
        },
      },
    },
  });

  return {
    type: "admin",
    users: users.map((u) => {
      const assignedRegion = u.assignedRegions[0]?.region;
      const primaryBlock = assignedRegion?.blocks[0];
      const primarySprayer = primaryBlock?.sprayers[0];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        city: u.profile?.city ?? null,
        domicile: u.profile?.domicile ?? null,
        regions: u.assignedRegions.map((assignment) => ({ id: assignment.region.id, name: assignment.region.name })),
        primarySprayer:
          assignedRegion && primaryBlock && primarySprayer
            ? {
                regionName: assignedRegion.name,
                blockName: primaryBlock.name,
                hardwareId: primarySprayer.hardwareId,
              }
            : null,
      };
    }),
  };
}

// ── profile ───────────────────────────────────────────────────────────────────

export type MyProfile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  profile: {
    whatsapp: string | null;
    nickname: string | null;
    gender: string | null;
    address: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    postalCode: string | null;
    deviceUsername: string | null;
    apiKey: string | null;
  } | null;
};

export async function getMyProfile(): Promise<MyProfile> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profile: {
        select: {
          whatsapp: true,
          nickname: true,
          gender: true,
          address: true,
          country: true,
          province: true,
          city: true,
          postalCode: true,
          deviceUsername: true,
          apiKey: true,
        },
      },
    },
  });
  return user as MyProfile;
}

export async function updateMyProfile(input: {
  name: string;
  whatsapp?: string;
  gender?: string;
  address?: string;
  country?: string;
  province?: string;
  city?: string;
  postalCode?: string;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.id }, data: { name: input.name.trim() } }),
    prisma.userProfile.upsert({
      where: { userId: session.id },
      create: {
        userId: session.id,
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        province: input.province?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
      },
      update: {
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        province: input.province?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
      },
    }),
  ]);
  return { ok: true };
}

export async function changeMyPassword(input: { currentPassword: string; newPassword: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new Response("Password saat ini tidak valid", { status: 400 });

  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: session.id }, data: { passwordHash: newHash } });
  return { ok: true };
}

// ── irrigation history ────────────────────────────────────────────────────────

export type HistoryFilters = {
  blockId?: string;
  status?: "ON" | "OFF";
  mode?: "AUTO" | "MANUAL";
  date?: string;
};

export async function getIrrigationHistory(filters: HistoryFilters) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const where: Prisma.IrrigationEventWhereInput = {};

  if (session.role !== "SUPERADMIN" || filters.blockId) {
    const blockIds = await getScopedBlockIds(session, filters.blockId);
    where.blockId = { in: blockIds };
  }
  if (filters.status) where.relay = filters.status === "ON" ? RelayState.ON : RelayState.OFF;
  if (filters.mode) where.mode = filters.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;
  if (filters.date) {
    const d = new Date(filters.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.startedAt = { gte: d, lt: next };
  }

  const events = await prisma.irrigationEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      mode: true,
      relay: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      totalVolumeLiter: true,
      block: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
      sprayer: { select: { id: true, displayName: true, hardwareId: true } },
      actor: { select: { id: true, name: true } },
    },
  });
  const thresholdMap =
    session.role === "USER"
      ? await getRegionThresholdMap(session.id, [...new Set(events.map((event) => event.block.region.id))])
      : new Map<string, Awaited<ReturnType<typeof getRegionThresholdMap>> extends Map<string, infer T> ? T : never>();
  const readings = await Promise.all(
    events.map((event) =>
      prisma.sensorReading.findFirst({
        where: {
          blockId: event.block.id,
          sprayerId: event.sprayer.id,
          recordedAt: { lte: event.startedAt },
        },
        orderBy: { recordedAt: "desc" },
        select: {
          moisturePercent: true,
          flowLmin: true,
          totalVolumeLiter: true,
          moistureStatus: true,
        },
      }),
    ),
  );

  return events.map((event, index) => {
    const reading = readings[index];
    const moisturePercent = reading ? Number(reading.moisturePercent) : null;
    const threshold = thresholdMap.get(event.block.region.id) ?? null;
    return {
      ...event,
      startedAt: event.startedAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
      totalVolumeLiter:
        event.totalVolumeLiter === null
          ? reading?.totalVolumeLiter === null || !reading
            ? null
            : Number(reading.totalVolumeLiter)
          : Number(event.totalVolumeLiter),
      sensor: reading
        ? {
            moisturePercent,
            flowLmin: Number(reading.flowLmin),
            moistureStatus:
              moisturePercent === null ? reading.moistureStatus : displayMoistureStatus(moisturePercent, threshold),
          }
        : null,
    };
  });
}

export async function getMyBlocks() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const regionIds = await getScopedRegionIds(session);
  return prisma.block.findMany({
    where: regionIds ? { regionId: { in: regionIds } } : undefined,
    select: { id: true, name: true, region: { select: { id: true, name: true } } },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
  });
}

// ── statistics ────────────────────────────────────────────────────────────────

export async function getStatistics(input: { blockId?: string; range: "today" | "7d" | "30d" }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const now = new Date();
  let since: Date;
  if (input.range === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (input.range === "7d") {
    since = new Date(Date.now() - 7 * 86400_000);
  } else {
    since = new Date(Date.now() - 30 * 86400_000);
  }

  let scopedBlockIds: string[] | null = null;
  if (input.blockId || session.role !== "SUPERADMIN") {
    scopedBlockIds = await getScopedBlockIds(session, input.blockId);
  }

  const blockFilter: Prisma.SensorReadingWhereInput = scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};
  const eventFilter: Prisma.IrrigationEventWhereInput = scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};

  const readings = await prisma.sensorReading.findMany({
    where: { ...blockFilter, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: {
      recordedAt: true,
      moisturePercent: true,
      flowLmin: true,
      totalVolumeLiter: true,
      moistureStatus: true,
      block: { select: { id: true, name: true, region: { select: { name: true } } } },
    },
    take: 2000,
  });

  const events = await prisma.irrigationEvent.findMany({
    where: { ...eventFilter, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    select: { mode: true, relay: true, startedAt: true, endedAt: true, blockId: true },
  });

  return {
    readings: readings.map((reading) => ({
      recordedAt: reading.recordedAt.toISOString(),
      moisturePercent: Number(reading.moisturePercent),
      flowLmin: Number(reading.flowLmin),
      totalVolumeLiter: reading.totalVolumeLiter === null ? null : Number(reading.totalVolumeLiter),
      moistureStatus: reading.moistureStatus,
      block: reading.block,
    })),
    events: events.map((event) => ({
      ...event,
      startedAt: event.startedAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
    })),
    since: since.toISOString(),
  };
}

// ── settings ──────────────────────────────────────────────────────────────────

export async function getMySettings() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const timeout = await prisma.systemSetting.findUnique({ where: { key: "safetyTimeout" } });
  const safetyTimeout = (timeout?.value as { min: number; max: number } | null) ?? { min: 1, max: 3 };

  if (session.role !== "USER") {
    return { role: session.role as "ADMIN" | "SUPERADMIN", regions: [], safetyTimeout };
  }

  const assignments = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    include: {
      region: {
        include: {
          _count: { select: { blocks: true } },
        },
      },
    },
  });
  const thresholdMap = await getRegionThresholdMap(
    session.id,
    assignments.map((assignment) => assignment.regionId),
  );

  return {
    role: "USER" as const,
    regions: assignments.map((assignment) => ({
      id: assignment.region.id,
      name: assignment.region.name,
      blockCount: assignment.region._count.blocks,
      threshold: thresholdMap.get(assignment.region.id) ?? null,
    })),
    safetyTimeout,
  };
}

export async function saveThreshold(input: {
  regionId: string;
  dryMaxPercent: number;
  wetMinPercent: number;
  displayDryMaxPercent?: number;
  displayMoistMaxPercent?: number;
  displayWetMinPercent?: number;
  landPreference?: MoistureStatus | string;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role !== "USER") throw new Response("Pengaturan region hanya tersedia untuk User.", { status: 403 });

  const assignment = await prisma.userRegionAssignment.findUnique({
    where: { userId_regionId: { userId: session.id, regionId: input.regionId } },
    include: { region: { select: { name: true } } },
  });
  if (!assignment) throw new Response("Region tidak berada di hak akses user.", { status: 403 });
  const displayThresholds = displayThresholdDefaults(input);

  await prisma.indicatorThreshold.upsert({
    where: { userId_regionId: { userId: session.id, regionId: input.regionId } },
    create: {
      userId: session.id,
      regionId: input.regionId,
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
      ...displayThresholds,
      landPreference: normalizePreference(input.landPreference),
    },
    update: {
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
      ...displayThresholds,
      landPreference: normalizePreference(input.landPreference),
    },
  });

  try {
    await updateRegionSettings({
      regionName: assignment.region.name,
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
    });
  } catch {
    // Land preference remains SQL-only; Firebase threshold sync is best-effort.
  }

  return { ok: true };
}

export async function saveSafetyTimeout(input: { min: number; max: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  const min = Math.min(10, Math.max(1, Math.round(input.min)));
  const max = Math.min(10, Math.max(1, Math.round(input.max)));
  if (min >= max) throw new Response("Durasi minimum harus lebih kecil dari maksimum.", { status: 400 });

  await prisma.systemSetting.upsert({
    where: { key: "safetyTimeout" },
    create: { key: "safetyTimeout", value: { min, max } },
    update: { value: { min, max } },
  });
  return { ok: true };
}

// ── user management (admin+) ──────────────────────────────────────────────────

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  whatsapp: string | null;
  regions: { id: string; name: string }[];
  createdAt: Date;
};

export async function getUserFormOptions() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const regionIds = await getScopedRegionIds(session);
  const regions = await prisma.region.findMany({
    where: regionIds ? { id: { in: regionIds } } : undefined,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return { actorRole: session.role, regions };
}

export async function getUsers(filters?: { role?: Role; search?: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const scopedRegionIds = await getScopedRegionIds(session);
  const where: Prisma.UserWhereInput =
    session.role === "ADMIN"
      ? {
          role: "USER",
          assignedRegions: { some: { regionId: { in: scopedRegionIds ?? [] } } },
        }
      : {};
  if (filters?.role && session.role === "SUPERADMIN") where.role = filters.role;
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { email: { contains: filters.search } },
      { profile: { whatsapp: { contains: filters.search } } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      profile: { select: { whatsapp: true } },
      assignedRegions: { select: { region: { select: { id: true, name: true } } } },
      administeredRegions: { select: { region: { select: { id: true, name: true } } } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    whatsapp: u.profile?.whatsapp ?? null,
    regions:
      u.role === "ADMIN"
        ? u.administeredRegions.map((assignment) => assignment.region)
        : u.assignedRegions.map((assignment) => assignment.region),
  })) as UserListItem[];
}

export async function setUserActive(input: { id: string; active: boolean }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);
  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    const target = await prisma.user.findFirst({
      where: { id: input.id, role: "USER", assignedRegions: { some: { regionId: { in: regionIds ?? [] } } } },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  await prisma.user.update({ where: { id: input.id }, data: { isActive: input.active } });
  await logActivity({
    actorId: session.id,
    action: input.active ? ActivityAction.UPDATE : ActivityAction.UPDATE,
    entityType: "User",
    entityId: input.id,
    metadata: { active: input.active },
  });
  return { ok: true };
}

export async function deleteUser(input: { id: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);
  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    const target = await prisma.user.findFirst({
      where: { id: input.id, role: "USER", assignedRegions: { some: { regionId: { in: regionIds ?? [] } } } },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  await prisma.user.delete({ where: { id: input.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "User", entityId: input.id });
  return { ok: true };
}

export async function createUserWithProfile(input: {
  actor?: SessionUser;
  name: string;
  email: string;
  password: string;
  role: Role;
  regionIds?: string[];
  whatsapp?: string;
  nickname?: string;
  gender?: string;
  birthDate?: string;
  altPhone?: string;
  occupation?: string;
  domicile?: string;
  address?: string;
  internalNotes?: string;
  deviceUsername?: string;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const role = session.role === "ADMIN" ? "USER" : input.role;
  const regionIds = await assertRegionsAssignable(session, input.regionIds ?? [], role);
  const passwordHash = await hashPassword(input.password);
  const apiKey = randomBytes(16)
    .toString("hex")
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role,
      profile: {
        create: {
          whatsapp: input.whatsapp?.trim() || null,
          nickname: input.nickname?.trim() || null,
          gender: input.gender || null,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          altPhone: input.altPhone?.trim() || null,
          occupation: input.occupation?.trim() || null,
          domicile: input.domicile?.trim() || null,
          address: input.address?.trim() || null,
          internalNotes: input.internalNotes?.trim() || null,
          deviceUsername: input.deviceUsername?.trim() || null,
          apiKey,
        },
      },
    },
  });

  if (role === "ADMIN") {
    await prisma.adminRegionAssignment.createMany({
      data: regionIds.map((regionId) => ({ adminId: user.id, regionId, assignedById: session.id })),
      skipDuplicates: true,
    });
  }
  if (role === "USER") {
    await prisma.userRegionAssignment.create({
      data: { userId: user.id, regionId: regionIds[0], assignedById: session.id },
    });
    await prisma.indicatorThreshold.upsert({
      where: { userId_regionId: { userId: user.id, regionId: regionIds[0] } },
      update: {},
      create: {
        userId: user.id,
        regionId: regionIds[0],
        dryMaxPercent: 40,
        wetMinPercent: 80,
        ...displayThresholdDefaults(),
        landPreference: MoistureStatus.LEMBAB,
      },
    });
  }

  await logActivity({ actorId: session.id, action: ActivityAction.CREATE, entityType: "User", entityId: user.id });
  return { ...user, apiKey };
}

export async function updateUserById(input: {
  id: string;
  name: string;
  email: string;
  role: Role;
  regionIds?: string[];
  whatsapp?: string;
  gender?: string;
  address?: string;
  domicile?: string;
  internalNotes?: string;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);
  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: input.id },
    include: {
      assignedRegions: true,
      administeredRegions: true,
    },
  });
  if (session.role === "ADMIN") {
    const scopedRegionIds = await getScopedRegionIds(session);
    const inScope =
      existing.role === "USER" &&
      existing.assignedRegions.some((assignment) => (scopedRegionIds ?? []).includes(assignment.regionId));
    if (!inScope) throw new Response("Forbidden", { status: 403 });
  }

  const role = session.role === "ADMIN" ? "USER" : input.role;
  const fallbackRegionIds =
    role === "ADMIN"
      ? existing.administeredRegions.map((assignment) => assignment.regionId)
      : existing.assignedRegions.map((assignment) => assignment.regionId);
  const regionIds = await assertRegionsAssignable(session, input.regionIds ?? fallbackRegionIds, role);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.id },
      data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), role },
    }),
    prisma.userProfile.upsert({
      where: { userId: input.id },
      create: {
        userId: input.id,
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        domicile: input.domicile?.trim() || null,
        internalNotes: input.internalNotes?.trim() || null,
      },
      update: {
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        domicile: input.domicile?.trim() || null,
        internalNotes: input.internalNotes?.trim() || null,
      },
    }),
  ]);

  await prisma.adminRegionAssignment.deleteMany({ where: { adminId: input.id } });
  await prisma.userRegionAssignment.deleteMany({ where: { userId: input.id } });
  if (role === "ADMIN") {
    await prisma.adminRegionAssignment.createMany({
      data: regionIds.map((regionId) => ({ adminId: input.id, regionId, assignedById: session.id })),
      skipDuplicates: true,
    });
  }
  if (role === "USER") {
    await prisma.userRegionAssignment.create({
      data: { userId: input.id, regionId: regionIds[0], assignedById: session.id },
    });
    await prisma.indicatorThreshold.upsert({
      where: { userId_regionId: { userId: input.id, regionId: regionIds[0] } },
      update: {},
      create: {
        userId: input.id,
        regionId: regionIds[0],
        dryMaxPercent: 40,
        wetMinPercent: 80,
        ...displayThresholdDefaults(),
        landPreference: MoistureStatus.LEMBAB,
      },
    });
  }

  await logActivity({ actorId: session.id, action: ActivityAction.UPDATE, entityType: "User", entityId: input.id });
  return { ok: true };
}

// ── region / block management ─────────────────────────────────────────────────

export async function createRegion(input: {
  actor?: SessionUser;
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const session = await getSession();
  const actor = assertSuperadmin(input.actor ?? session);
  const region = await prisma.region.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim(),
      latitude: decimalCoordinate(input.latitude, "Latitude"),
      longitude: decimalCoordinate(input.longitude, "Longitude"),
      createdById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionRegionNode(region);
    const synced = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
    await logActivity({
      actorId: actor.id,
      regionId: region.id,
      action: ActivityAction.CREATE,
      entityType: "Region",
      entityId: region.id,
    });
    return synced;
  } catch (error) {
    await prisma.region.update({ where: { id: region.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function updateRegion(input: {
  actor?: SessionUser;
  id: string;
  name: string;
  description?: string;
  latitude?: CoordinateInput;
  longitude?: CoordinateInput;
}) {
  const session = await getSession();
  const actor = assertSuperadmin(input.actor ?? session);
  const existing = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  const updated = await prisma.region.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim(),
      latitude: decimalCoordinate(input.latitude, "Latitude"),
      longitude: decimalCoordinate(input.longitude, "Longitude"),
      updatedById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await renameRegionNode(existing.name, updated);
    await logActivity({
      actorId: actor.id,
      regionId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Region",
      entityId: updated.id,
    });
    return prisma.region.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    await prisma.region.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function createBlock(input: {
  actor: SessionUser;
  regionId: string;
  name: string;
  areaHectare?: string;
  description?: string;
}) {
  const actor = assertAdminOrHigher(input.actor);
  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.regionId } });
  const block = await prisma.block.create({
    data: {
      regionId: region.id,
      name: input.name.trim(),
      areaHectare: input.areaHectare,
      createdById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionBlockNode({ regionName: region.name, blockName: block.name });
    await logActivity({
      actorId: actor.id,
      regionId: region.id,
      blockId: block.id,
      action: ActivityAction.CREATE,
      entityType: "Block",
      entityId: block.id,
    });
    return prisma.block.update({
      where: { id: block.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    await prisma.block.update({ where: { id: block.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function updateBlock(input: { actor: SessionUser; id: string; name: string; areaHectare?: string }) {
  const actor = assertAdminOrHigher(input.actor);
  const existing = await prisma.block.findUniqueOrThrow({ where: { id: input.id }, include: { region: true } });
  const updated = await prisma.block.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      areaHectare: input.areaHectare,
      updatedById: actor.id,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await renameBlockNode(existing.name, { regionName: existing.region.name, blockName: updated.name });
    await logActivity({
      actorId: actor.id,
      regionId: existing.regionId,
      blockId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Block",
      entityId: updated.id,
    });
    return prisma.block.update({
      where: { id: updated.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    await prisma.block.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function createSprayer(input: {
  actor: SessionUser;
  blockId: string;
  hardwareId: string;
  displayName: string;
  dryMaxPercent: number;
  wetMinPercent: number;
}) {
  const actor = assertAdminOrHigher(input.actor);
  const block = await prisma.block.findUniqueOrThrow({ where: { id: input.blockId }, include: { region: true } });
  const sprayer = await prisma.sprayer.create({
    data: {
      blockId: block.id,
      hardwareId: input.hardwareId.trim(),
      displayName: input.displayName.trim(),
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionSprayerNode({
      regionName: block.region.name,
      blockName: block.name,
      hardwareId: sprayer.hardwareId,
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
    });
    await logActivity({
      actorId: actor.id,
      regionId: block.regionId,
      blockId: block.id,
      action: ActivityAction.CREATE,
      entityType: "Sprayer",
      entityId: sprayer.id,
    });
    return prisma.sprayer.update({
      where: { id: sprayer.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
  } catch (error) {
    await prisma.sprayer.update({ where: { id: sprayer.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

// ── pump control ──────────────────────────────────────────────────────────────

export async function overridePump(input: { sprayerId: string; mode: "AUTO" | "MANUAL"; relay: "OFF" | "ON" }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const sprayer = await prisma.sprayer.findUniqueOrThrow({
    where: { id: input.sprayerId },
    include: { block: { include: { region: true } } },
  });
  if (session.role !== "SUPERADMIN") {
    const regionIds = await getScopedRegionIds(session);
    if (!regionIds?.includes(sprayer.block.regionId)) throw new Response("Forbidden", { status: 403 });
  }

  await updateSprayerControl({
    regionName: sprayer.block.region.name,
    blockName: sprayer.block.name,
    hardwareId: sprayer.hardwareId,
    mode: input.mode,
    relay: input.relay,
  });

  const event = await prisma.irrigationEvent.create({
    data: {
      blockId: sprayer.blockId,
      sprayerId: sprayer.id,
      actorId: session.id,
      mode: input.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
      relay: input.relay === "ON" ? RelayState.ON : RelayState.OFF,
      reason: "Manual dashboard override",
      startedAt: new Date(),
    },
  });

  await logActivity({
    actorId: session.id,
    regionId: sprayer.block.regionId,
    blockId: sprayer.blockId,
    action: ActivityAction.CONTROL_OVERRIDE,
    entityType: "Sprayer",
    entityId: sprayer.id,
  });

  return event;
}

// ── password reset ────────────────────────────────────────────────────────────

export async function requestPasswordReset(input: { email: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user) return { ok: true };

  const token = newOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
  });

  const resetUrl = `${serverConfig.appOrigin}/reset-password?token=${token}`;
  await sendPasswordResetEmail({
    recipientId: user.id,
    to: user.email,
    resetUrl,
  });
  await logActivity({
    actorId: user.id,
    action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
    entityType: "User",
    entityId: user.id,
  });
  return { ok: true };
}

export async function completePasswordReset(input: { token: string; newPassword: string }) {
  const tokenHash = hashToken(input.token);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    throw new Response("Token tidak valid atau sudah kedaluwarsa", { status: 400 });

  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: newHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await logActivity({
    actorId: reset.userId,
    action: ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
    entityType: "User",
    entityId: reset.userId,
  });
  return { ok: true };
}

// ── user creation (original) ──────────────────────────────────────────────────

export async function createUser(input: {
  actor: SessionUser;
  email: string;
  name: string;
  password: string;
  role: Role;
}) {
  const actor = assertSuperadmin(input.actor);
  const user = await prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    },
  });
  await logActivity({ actorId: actor.id, action: ActivityAction.CREATE, entityType: "User", entityId: user.id });
  return user;
}

// ── superadmin: region management ────────────────────────────────────────────

export async function getRegions() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const regions = await prisma.region.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      latitude: true,
      longitude: true,
      firebaseSyncStatus: true,
      firebaseSyncedAt: true,
      createdAt: true,
      _count: { select: { blocks: true, adminAssignments: true } },
      adminAssignments: {
        select: { admin: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return regions.map((region) => ({
    id: region.id,
    name: region.name,
    description: region.description,
    latitude: region.latitude === null ? null : Number(region.latitude),
    longitude: region.longitude === null ? null : Number(region.longitude),
    firebaseSyncStatus: region.firebaseSyncStatus,
    firebaseSyncedAt: region.firebaseSyncedAt?.toISOString() ?? null,
    createdAt: region.createdAt.toISOString(),
    _count: region._count,
    adminAssignments: region.adminAssignments,
  }));
}

export async function deleteRegion(input: { id: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  await prisma.region.delete({ where: { id: input.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "Region", entityId: input.id });

  try {
    const { firebaseAdminDb } = await import("../services/firebaseAdmin");
    const { firebaseSegment } = await import("~/lib/shared/irrigation");
    await firebaseAdminDb().ref(firebaseSegment(region.name)).remove();
  } catch {
    // Firebase not configured — ignore
  }

  return { ok: true };
}

export async function getAdmins() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  return prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function assignAdminToRegion(input: { adminId: string; regionId: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.upsert({
    where: { adminId_regionId: { adminId: input.adminId, regionId: input.regionId } },
    update: {},
    create: { adminId: input.adminId, regionId: input.regionId, assignedById: session.id },
  });
  await logActivity({
    actorId: session.id,
    regionId: input.regionId,
    action: ActivityAction.ASSIGN,
    entityType: "AdminRegion",
    entityId: input.adminId,
  });
  return { ok: true };
}

export async function removeAdminFromRegion(input: { adminId: string; regionId: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.deleteMany({
    where: { adminId: input.adminId, regionId: input.regionId },
  });
  await logActivity({
    actorId: session.id,
    regionId: input.regionId,
    action: ActivityAction.UNASSIGN,
    entityType: "AdminRegion",
    entityId: input.adminId,
  });
  return { ok: true };
}

// ── superadmin: system logs ───────────────────────────────────────────────────

export type ActivityLogItem = {
  id: string;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  actor: { name: string; email: string } | null;
  metadata: unknown;
};

export async function getActivityLogs(input?: { action?: string; limit?: number; offset?: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const logs = await prisma.activityLog.findMany({
    where: input?.action ? { action: input.action as ActivityAction } : undefined,
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 50,
    skip: input?.offset ?? 0,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      metadata: true,
      actor: { select: { name: true, email: true } },
    },
  });

  const total = await prisma.activityLog.count({
    where: input?.action ? { action: input.action as ActivityAction } : undefined,
  });

  return { logs: logs as ActivityLogItem[], total };
}

// ── superadmin: map configuration ────────────────────────────────────────────

export type MapConfig = { lat: number; lng: number; zoom: number };
export type MapPoint = { lat: number; lng: number };
export type MapWorkspace = MapConfig & {
  regions: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    blocks: { id: string; name: string; polygonGeojson: Prisma.JsonValue | null }[];
  }[];
};

export async function getMapConfig(): Promise<MapConfig> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const setting = await prisma.systemSetting.findUnique({ where: { key: "mapConfig" } });
  return (setting?.value as MapConfig | null) ?? { lat: -6.9175, lng: 107.6191, zoom: 12 };
}

export async function getMapWorkspace(): Promise<MapWorkspace> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const [config, regions] = await Promise.all([
    getMapConfig(),
    prisma.region.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        blocks: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, polygonGeojson: true },
        },
      },
    }),
  ]);

  return {
    ...config,
    regions: regions.map((region) => ({
      id: region.id,
      name: region.name,
      latitude: region.latitude ? Number(region.latitude) : null,
      longitude: region.longitude ? Number(region.longitude) : null,
      blocks: region.blocks,
    })),
  };
}

export async function saveMapConfig(input: MapConfig) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "mapConfig" },
    create: { key: "mapConfig", value: input },
    update: { value: input },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "mapConfig",
  });
  return { ok: true };
}

export async function saveBlockMapGeometry(input: { blockId: string; points: MapPoint[] }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const geojson = pointsToPolygonGeojson(input.points);
  const block = await prisma.block.update({
    where: { id: input.blockId },
    data: { polygonGeojson: geojson ?? Prisma.JsonNull },
    select: { id: true, regionId: true },
  });

  await logActivity({
    actorId: session.id,
    regionId: block.regionId,
    blockId: block.id,
    action: ActivityAction.UPDATE,
    entityType: "BlockMapGeometry",
    entityId: block.id,
    metadata: { pointCount: input.points.length },
  });
  return { ok: true };
}
