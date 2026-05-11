"use server";

import { randomBytes } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { ActivityAction, IrrigationMode, RelayState, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "./prisma";
import { sendTransactionalEmail } from "./email";
import {
  provisionBlockNode,
  provisionRegionNode,
  provisionSprayerNode,
  renameBlockNode,
  renameRegionNode,
  updateSprayerControl,
} from "./firebaseSync";
import { serverConfig } from "./config";
import {
  assertAdminOrHigher,
  assertSuperadmin,
  hashPassword,
  hashToken,
  newOpaqueToken,
  verifyPassword,
  type SessionUser,
} from "./security";
import { createSession, destroySession, getSession } from "./session";

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
  blocks: {
    id: string;
    name: string;
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
    const assignments = await prisma.userBlockAssignment.findMany({
      where: { userId: session.id },
      include: {
        block: {
          include: {
            region: true,
            sprayers: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    const regionMap = new Map<string, DashboardRegion>();
    for (const a of assignments) {
      const r = a.block.region;
      if (!regionMap.has(r.id)) {
        regionMap.set(r.id, { id: r.id, name: r.name, description: r.description, blocks: [] });
      }
      regionMap.get(r.id)!.blocks.push({
        id: a.block.id,
        name: a.block.name,
        sprayers: a.block.sprayers.map((s) => ({
          id: s.id,
          hardwareId: s.hardwareId,
          displayName: s.displayName,
        })),
      });
    }

    return { type: "user", regions: Array.from(regionMap.values()) };
  }

  // Admin / Superadmin: show users list
  const users = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      profile: { select: { city: true, domicile: true } },
      assignedBlocks: {
        take: 1,
        include: { block: { include: { region: true, sprayers: { take: 1, where: { isActive: true } } } } },
      },
    },
  });

  return {
    type: "admin",
    users: users.map((u) => {
      const ab = u.assignedBlocks[0];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        city: u.profile?.city ?? null,
        domicile: u.profile?.domicile ?? null,
        primarySprayer:
          ab && ab.block.sprayers[0]
            ? {
                regionName: ab.block.region.name,
                blockName: ab.block.name,
                hardwareId: ab.block.sprayers[0].hardwareId,
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

  if (session.role === "USER") {
    const blockIds = await prisma.userBlockAssignment
      .findMany({ where: { userId: session.id }, select: { blockId: true } })
      .then((r) => r.map((a) => a.blockId));
    where.blockId = { in: blockIds };
  }

  if (filters.blockId) where.blockId = filters.blockId;
  if (filters.status) where.relay = filters.status === "ON" ? RelayState.ON : RelayState.OFF;
  if (filters.mode) where.mode = filters.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;
  if (filters.date) {
    const d = new Date(filters.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.startedAt = { gte: d, lt: next };
  }

  return prisma.irrigationEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      block: { include: { region: true } },
      sprayer: true,
      actor: { select: { id: true, name: true } },
    },
  });
}

export async function getMyBlocks() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  if (session.role === "USER") {
    return prisma.userBlockAssignment.findMany({
      where: { userId: session.id },
      include: { block: { include: { region: true } } },
      orderBy: { block: { name: "asc" } },
    });
  }
  return prisma.block.findMany({
    include: { region: true },
    orderBy: { name: "asc" },
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

  // Build role-scoped block filter
  let scopedBlockIds: string[] | null = null;

  if (input.blockId) {
    scopedBlockIds = [input.blockId];
  } else if (session.role === "USER") {
    const assignments = await prisma.userBlockAssignment.findMany({
      where: { userId: session.id },
      select: { blockId: true },
    });
    scopedBlockIds = assignments.map((a) => a.blockId);
  } else if (session.role === "ADMIN") {
    const regionAssignments = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      select: { regionId: true },
    });
    const blocks = await prisma.block.findMany({
      where: { regionId: { in: regionAssignments.map((a) => a.regionId) } },
      select: { id: true },
    });
    scopedBlockIds = blocks.map((b) => b.id);
  }
  // SUPERADMIN: scopedBlockIds stays null → no filter → all data

  const blockFilter: Prisma.SensorReadingWhereInput =
    scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};
  const eventFilter: Prisma.IrrigationEventWhereInput =
    scopedBlockIds ? { blockId: { in: scopedBlockIds } } : {};

  const readings = await prisma.sensorReading.findMany({
    where: { ...blockFilter, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: {
      recordedAt: true,
      moisturePercent: true,
      flowLmin: true,
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

  return { readings, events, since };
}

// ── settings ──────────────────────────────────────────────────────────────────

export async function getMySettings() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const timeout = await prisma.systemSetting.findUnique({ where: { key: "safetyTimeout" } });
  const safetyTimeout = (timeout?.value as { min: number; max: number } | null) ?? { min: 1, max: 3 };

  if (session.role === "SUPERADMIN") {
    return { role: "SUPERADMIN" as const, blocks: [], safetyTimeout };
  }

  if (session.role === "ADMIN") {
    // Admin sees all blocks across their assigned regions
    const regionAssignments = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      select: { regionId: true },
    });
    const blocks = await prisma.block.findMany({
      where: { regionId: { in: regionAssignments.map((a) => a.regionId) } },
      include: {
        region: { select: { name: true } },
        thresholds: { take: 1 },
      },
      orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
    });
    return {
      role: "ADMIN" as const,
      blocks: blocks.map((b) => ({
        id: b.id,
        name: b.name,
        regionName: b.region.name,
        threshold: b.thresholds[0] ?? null,
      })),
      safetyTimeout,
    };
  }

  // USER: only their assigned blocks
  const assignments = await prisma.userBlockAssignment.findMany({
    where: { userId: session.id },
    include: {
      block: {
        include: {
          thresholds: { where: { userId: session.id } },
          region: { select: { name: true } },
        },
      },
    },
  });

  return {
    role: "USER" as const,
    blocks: assignments.map((a) => ({
      id: a.block.id,
      name: a.block.name,
      regionName: a.block.region.name,
      threshold: a.block.thresholds[0] ?? null,
    })),
    safetyTimeout,
  };
}

export async function saveThreshold(input: { blockId: string; dryMaxPercent: number; wetMinPercent: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  await prisma.indicatorThreshold.upsert({
    where: { userId_blockId: { userId: session.id, blockId: input.blockId } },
    create: {
      userId: session.id,
      blockId: input.blockId,
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
    },
    update: { dryMaxPercent: input.dryMaxPercent, wetMinPercent: input.wetMinPercent },
  });
  return { ok: true };
}

export async function saveSafetyTimeout(input: { min: number; max: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  await prisma.systemSetting.upsert({
    where: { key: "safetyTimeout" },
    create: { key: "safetyTimeout", value: input },
    update: { value: input },
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
  createdAt: Date;
};

export async function getUsers(filters?: { role?: Role; search?: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const where: Prisma.UserWhereInput = {};
  if (filters?.role) where.role = filters.role;
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
    },
  });

  return users.map((u) => ({ ...u, whatsapp: u.profile?.whatsapp ?? null })) as UserListItem[];
}

export async function setUserActive(input: { id: string; active: boolean }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

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
  assertSuperadmin(session);

  await prisma.user.delete({ where: { id: input.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "User", entityId: input.id });
  return { ok: true };
}

export async function createUserWithProfile(input: {
  actor: SessionUser;
  name: string;
  email: string;
  password: string;
  role: Role;
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

  const passwordHash = await hashPassword(input.password);
  const apiKey = randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role: input.role,
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

  await logActivity({ actorId: session.id, action: ActivityAction.CREATE, entityType: "User", entityId: user.id });
  return { ...user, apiKey };
}

export async function updateUserById(input: {
  id: string;
  name: string;
  email: string;
  role: Role;
  whatsapp?: string;
  gender?: string;
  address?: string;
  domicile?: string;
  internalNotes?: string;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.id },
      data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role },
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

  await logActivity({ actorId: session.id, action: ActivityAction.UPDATE, entityType: "User", entityId: input.id });
  return { ok: true };
}

// ── region / block management ─────────────────────────────────────────────────

export async function createRegion(input: { actor: SessionUser; name: string; description?: string }) {
  const actor = assertSuperadmin(input.actor);
  const region = await prisma.region.create({
    data: { name: input.name.trim(), description: input.description?.trim(), createdById: actor.id, firebaseSyncStatus: SyncStatus.PENDING },
  });
  try {
    await provisionRegionNode(region);
    const synced = await prisma.region.update({
      where: { id: region.id },
      data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
    });
    await logActivity({ actorId: actor.id, regionId: region.id, action: ActivityAction.CREATE, entityType: "Region", entityId: region.id });
    return synced;
  } catch (error) {
    await prisma.region.update({ where: { id: region.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function updateRegion(input: { actor: SessionUser; id: string; name: string; description?: string }) {
  const actor = assertSuperadmin(input.actor);
  const existing = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  const updated = await prisma.region.update({
    where: { id: input.id },
    data: { name: input.name.trim(), description: input.description?.trim(), updatedById: actor.id, firebaseSyncStatus: SyncStatus.PENDING },
  });
  try {
    await renameRegionNode(existing.name, updated);
    await logActivity({ actorId: actor.id, regionId: updated.id, action: ActivityAction.UPDATE, entityType: "Region", entityId: updated.id });
    return prisma.region.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() } });
  } catch (error) {
    await prisma.region.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    throw error;
  }
}

export async function createBlock(input: { actor: SessionUser; regionId: string; name: string; areaHectare?: string; description?: string }) {
  const actor = assertAdminOrHigher(input.actor);
  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.regionId } });
  const block = await prisma.block.create({
    data: { regionId: region.id, name: input.name.trim(), areaHectare: input.areaHectare, createdById: actor.id, firebaseSyncStatus: SyncStatus.PENDING },
  });
  try {
    await provisionBlockNode({ regionName: region.name, blockName: block.name });
    await logActivity({ actorId: actor.id, regionId: region.id, blockId: block.id, action: ActivityAction.CREATE, entityType: "Block", entityId: block.id });
    return prisma.block.update({ where: { id: block.id }, data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() } });
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
    data: { name: input.name.trim(), areaHectare: input.areaHectare, updatedById: actor.id, firebaseSyncStatus: SyncStatus.PENDING },
  });
  try {
    await renameBlockNode(existing.name, { regionName: existing.region.name, blockName: updated.name });
    await logActivity({ actorId: actor.id, regionId: existing.regionId, blockId: updated.id, action: ActivityAction.UPDATE, entityType: "Block", entityId: updated.id });
    return prisma.block.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() } });
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
    data: { blockId: block.id, hardwareId: input.hardwareId.trim(), displayName: input.displayName.trim(), firebaseSyncStatus: SyncStatus.PENDING },
  });
  try {
    await provisionSprayerNode({ regionName: block.region.name, blockName: block.name, hardwareId: sprayer.hardwareId, dryMaxPercent: input.dryMaxPercent, wetMinPercent: input.wetMinPercent });
    await logActivity({ actorId: actor.id, regionId: block.regionId, blockId: block.id, action: ActivityAction.CREATE, entityType: "Sprayer", entityId: sprayer.id });
    return prisma.sprayer.update({ where: { id: sprayer.id }, data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() } });
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
  await sendTransactionalEmail({
    recipientId: user.id,
    to: user.email,
    subject: "Reset password Adosistering",
    text: `Buka tautan ini untuk reset password: ${resetUrl}`,
    html: `<p>Klik tautan berikut untuk reset password Anda:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Tautan berlaku 30 menit.</p>`,
  });
  await logActivity({ actorId: user.id, action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST, entityType: "User", entityId: user.id });
  return { ok: true };
}

export async function completePasswordReset(input: { token: string; newPassword: string }) {
  const tokenHash = hashToken(input.token);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw new Response("Token tidak valid atau sudah kedaluwarsa", { status: 400 });

  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: newHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await logActivity({ actorId: reset.userId, action: ActivityAction.AUTH_PASSWORD_RESET_COMPLETE, entityType: "User", entityId: reset.userId });
  return { ok: true };
}

// ── user creation (original) ──────────────────────────────────────────────────

export async function createUser(input: { actor: SessionUser; email: string; name: string; password: string; role: Role }) {
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

  return prisma.region.findMany({
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
}

export async function deleteRegion(input: { id: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.id } });
  await prisma.region.delete({ where: { id: input.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "Region", entityId: input.id });

  try {
    const { firebaseAdminDb } = await import("./firebaseAdmin");
    const { firebaseSegment } = await import("~/domain/irrigation");
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
  await logActivity({ actorId: session.id, regionId: input.regionId, action: ActivityAction.ASSIGN, entityType: "AdminRegion", entityId: input.adminId });
  return { ok: true };
}

export async function removeAdminFromRegion(input: { adminId: string; regionId: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.adminRegionAssignment.deleteMany({
    where: { adminId: input.adminId, regionId: input.regionId },
  });
  await logActivity({ actorId: session.id, regionId: input.regionId, action: ActivityAction.UNASSIGN, entityType: "AdminRegion", entityId: input.adminId });
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

export async function getMapConfig(): Promise<MapConfig> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const setting = await prisma.systemSetting.findUnique({ where: { key: "mapConfig" } });
  return (setting?.value as MapConfig | null) ?? { lat: -6.9175, lng: 107.6191, zoom: 12 };
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
  await logActivity({ actorId: session.id, action: ActivityAction.UPDATE, entityType: "SystemSetting", entityId: "mapConfig" });
  return { ok: true };
}
