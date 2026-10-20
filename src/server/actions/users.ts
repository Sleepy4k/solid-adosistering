"use server";

import { randomBytes } from "node:crypto";
import { ActivityAction, MoistureStatus, Prisma, type Role } from "@prisma/client";
import type { UserListItem } from "~/types/users";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendWelcomeUserEmail } from "../email";
import { serverConfig } from "../config";
import { assertAdminOrHigher, hashPassword } from "../security";
import { destroyAllUserSessions, getSession } from "../session";
import { assertRegionsAssignable, displayThresholdDefaults, getScopedRegionIds, logActivity } from "./_helpers";
import {
  createUserSchema,
  deleteUserSchema,
  parseInput,
  setUserActiveSchema,
  updateUserSchema,
  userListFiltersSchema,
} from "../validation";

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
export type { UserListItem };

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
  const parsedFilters = filters ? parseInput(userListFiltersSchema, filters) : {};
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const scopedRegionIds = await getScopedRegionIds(session);
  const where: Prisma.UserWhereInput =
    session.role === "ADMIN"
      ? { role: "USER", assignedRegions: { some: { regionId: { in: scopedRegionIds ?? [] } } } }
      : {};
  if (parsedFilters.role && session.role === "SUPERADMIN") where.role = parsedFilters.role;
  if (parsedFilters.search) {
    const term = `%${parsedFilters.search}%`;
    const matchingIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM \`user\` u
      LEFT JOIN user_detail p ON p.user_id = u.id
      WHERE u.name LIKE ${term} COLLATE utf8mb4_unicode_ci
         OR u.email LIKE ${term} COLLATE utf8mb4_unicode_ci
         OR p.whatsapp LIKE ${term} COLLATE utf8mb4_unicode_ci
    `;
    if (matchingIds.length === 0) return [];
    where.id = { in: matchingIds.map((r) => r.id) };
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
    regions: u.role === "ADMIN" ? u.administeredRegions.map((a) => a.region) : u.assignedRegions.map((a) => a.region),
  })) as UserListItem[];
}

export async function setUserActive(input: { id: string; active: boolean }) {
  const data = parseInput(setUserActiveSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);
  if (session.id === data.id) throw new Response("Anda tidak dapat mengubah status akun sendiri.", { status: 400 });

  const targetRole = await prisma.user.findUnique({ where: { id: data.id }, select: { role: true } });
  if (!targetRole) throw new Response("User tidak ditemukan.", { status: 404 });
  if (!data.active && targetRole.role === "SUPERADMIN") {
    const activeSuperadmins = await prisma.user.count({ where: { role: "SUPERADMIN", isActive: true } });
    if (activeSuperadmins <= 1)
      throw new Response("Superadmin aktif terakhir tidak dapat dinonaktifkan.", { status: 400 });
  }

  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    const target = await prisma.user.findFirst({
      where: { id: data.id, role: "USER", assignedRegions: { some: { regionId: { in: regionIds ?? [] } } } },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  try {
    await prisma.user.update({ where: { id: data.id }, data: { isActive: data.active } });
  } catch (error) {
    if (isMissingRecord(error)) throw new Response("User tidak ditemukan.", { status: 404 });
    throw error;
  }
  if (!data.active) await destroyAllUserSessions(data.id);
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "User",
    entityId: data.id,
    metadata: { active: data.active },
  });
  return { ok: true };
}

export async function deleteUser(input: { id: string }) {
  const data = parseInput(deleteUserSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);
  if (session.id === data.id) throw new Response("Anda tidak dapat menghapus akun sendiri.", { status: 400 });

  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    const target = await prisma.user.findFirst({
      where: { id: data.id, role: "USER", assignedRegions: { some: { regionId: { in: regionIds ?? [] } } } },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: data.id }, select: { role: true } });
  if (!target) throw new Response("User tidak ditemukan.", { status: 404 });
  if (target.role === "SUPERADMIN") {
    const superadminCount = await prisma.user.count({ where: { role: "SUPERADMIN", isActive: true } });
    if (superadminCount <= 1) throw new Response("Superadmin terakhir tidak dapat dihapus.", { status: 400 });
  }
  await prisma.user.delete({ where: { id: data.id } });
  await logActivity({ actorId: session.id, action: ActivityAction.DELETE, entityType: "User", entityId: data.id });
  return { ok: true };
}

export async function createUserWithProfile(input: {
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
  const data = parseInput(createUserSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const role = session.role === "ADMIN" ? "USER" : data.role;
  const regionIds = await assertRegionsAssignable(session, data.regionIds ?? [], role);
  const passwordHash = await hashPassword(data.password);
  const apiKey = randomBytes(16)
    .toString("hex")
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash,
        role,
        profile: {
          create: {
            whatsapp: data.whatsapp?.trim() || null,
            nickname: data.nickname?.trim() || null,
            gender: data.gender || null,
            birthDate: data.birthDate ? new Date(data.birthDate) : null,
            altPhone: data.altPhone?.trim() || null,
            occupation: data.occupation?.trim() || null,
            domicile: data.domicile?.trim() || null,
            address: data.address?.trim() || null,
            internalNotes: data.internalNotes?.trim() || null,
            deviceUsername: data.deviceUsername?.trim() || null,
            apiKey,
          },
        },
      },
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw new Response("Email sudah digunakan.", { status: 409 });
    throw error;
  }

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
  sendWelcomeUserEmail({
    recipientId: user.id,
    to: user.email,
    name: user.name,
    email: user.email,
    password: data.password,
    loginUrl: `${serverConfig.appOrigin}/login`,
  }).catch((err: unknown) => console.error("[email] welcomeUser:", err));
  return { id: user.id, name: user.name, email: user.email, role: user.role, apiKey };
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
  const data = parseInput(updateUserSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: data.id },
    include: { assignedRegions: true, administeredRegions: true },
  });
  if (session.role === "ADMIN") {
    const scopedRegionIds = await getScopedRegionIds(session);
    const inScope =
      existing.role === "USER" && existing.assignedRegions.some((a) => (scopedRegionIds ?? []).includes(a.regionId));
    if (!inScope) throw new Response("Forbidden", { status: 403 });
  }

  const role = session.role === "ADMIN" ? "USER" : data.role;
  if (session.id === data.id && role !== existing.role) {
    throw new Response("Anda tidak dapat mengubah role akun sendiri.", { status: 400 });
  }
  if (existing.role === "SUPERADMIN" && role !== "SUPERADMIN") {
    const activeSuperadmins = await prisma.user.count({ where: { role: "SUPERADMIN", isActive: true } });
    if (activeSuperadmins <= 1) {
      throw new Response("Superadmin aktif terakhir tidak dapat diturunkan role-nya.", { status: 400 });
    }
  }
  const fallbackRegionIds =
    role === "ADMIN"
      ? existing.administeredRegions.map((a) => a.regionId)
      : existing.assignedRegions.map((a) => a.regionId);
  const regionIds = await assertRegionsAssignable(session, data.regionIds ?? fallbackRegionIds, role);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: data.id },
        data: { name: data.name.trim(), email: data.email.trim().toLowerCase(), role },
      }),
      prisma.userProfile.upsert({
        where: { userId: data.id },
        create: {
          userId: data.id,
          whatsapp: data.whatsapp?.trim() || null,
          gender: data.gender || null,
          address: data.address?.trim() || null,
          domicile: data.domicile?.trim() || null,
          internalNotes: data.internalNotes?.trim() || null,
        },
        update: {
          whatsapp: data.whatsapp?.trim() || null,
          gender: data.gender || null,
          address: data.address?.trim() || null,
          domicile: data.domicile?.trim() || null,
          internalNotes: data.internalNotes?.trim() || null,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueConstraint(error)) throw new Response("Email sudah digunakan.", { status: 409 });
    throw error;
  }

  await prisma.adminRegionAssignment.deleteMany({ where: { adminId: data.id } });
  await prisma.userRegionAssignment.deleteMany({ where: { userId: data.id } });
  if (role === "ADMIN") {
    await prisma.adminRegionAssignment.createMany({
      data: regionIds.map((regionId) => ({ adminId: data.id, regionId, assignedById: session.id })),
      skipDuplicates: true,
    });
  }
  if (role === "USER") {
    await prisma.userRegionAssignment.create({
      data: { userId: data.id, regionId: regionIds[0], assignedById: session.id },
    });
    await prisma.indicatorThreshold.upsert({
      where: { userId_regionId: { userId: data.id, regionId: regionIds[0] } },
      update: {},
      create: {
        userId: data.id,
        regionId: regionIds[0],
        dryMaxPercent: 40,
        wetMinPercent: 80,
        ...displayThresholdDefaults(),
        landPreference: MoistureStatus.LEMBAB,
      },
    });
  }

  if (existing.email !== data.email.trim().toLowerCase() || existing.role !== role) {
    await destroyAllUserSessions(data.id);
  }
  await logActivity({ actorId: session.id, action: ActivityAction.UPDATE, entityType: "User", entityId: data.id });
  return { ok: true };
}
