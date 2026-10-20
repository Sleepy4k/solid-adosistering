"use server";

import { randomBytes } from "node:crypto";
import { ActivityAction, MoistureStatus, Prisma, type Role } from "@prisma/client";
import type { UserListItem } from "~/types/users";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendWelcomeUserEmail } from "../integrations/email";
import { serverConfig } from "../config";
import { assertAdminOrHigher, hashPassword, newOpaqueToken } from "../auth/security";
import { destroyAllUserSessions, getSession } from "../auth/session";
import { assertRegionsAssignable, displayThresholdDefaults, getScopedRegionIds, logActivity } from "../domain";
import {
  createUserSchema,
  deleteUserSchema,
  parseInput,
  setUserActiveSchema,
  updateUserSchema,
  userListFiltersSchema,
} from "../validation";

const LIKE_ESCAPE_CHAR = "!";

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Field names reported by Prisma in `meta.target` for a P2002. Prisma may send
 * a single column name or an array (MariaDB reports the unique index columns).
 */
function uniqueTargetFields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return [];
  const target = error.meta?.target;
  if (typeof target === "string") return [target.toLowerCase()];
  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string").map((field) => field.toLowerCase());
  }
  return [];
}

function uniqueConstraintMessage(error: unknown): string {
  const fields = uniqueTargetFields(error);
  if (fields.includes("email")) return "Email sudah digunakan.";
  if (fields.includes("deviceusername") || fields.includes("apikey")) return "Data unik sudah digunakan.";
  return "Data yang sama sudah ada.";
}

function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** Prisma P2000: a value is too long for the target column. */
function isLengthConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2000";
}

/** Escape LIKE wildcards so user input is matched literally (`!` is the ESCAPE char). */
function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`);
}

function mapKnownUserErrors(error: unknown): never {
  if (isUniqueConstraint(error)) throw new Response(uniqueConstraintMessage(error), { status: 409 });
  if (isLengthConstraint(error)) throw new Response("Data yang dikirim terlalu panjang.", { status: 400 });
  if (isMissingRecord(error)) throw new Response("User tidak ditemukan.", { status: 404 });
  throw error;
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
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(session.role === "ADMIN"
      ? { role: "USER", assignedRegions: { some: { regionId: { in: scopedRegionIds ?? [] } } } }
      : {}),
  };
  if (parsedFilters.role && session.role === "SUPERADMIN") where.role = parsedFilters.role;
  if (parsedFilters.search) {
    const term = `%${escapeLikePattern(parsedFilters.search)}%`;
    const matchingIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM \`user\` u
      LEFT JOIN user_detail p ON p.user_id = u.id
      WHERE (u.name LIKE ${term} ESCAPE '!'
         OR u.email LIKE ${term} ESCAPE '!'
         OR p.whatsapp LIKE ${term} ESCAPE '!')
        AND u.deleted_at IS NULL
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

  const targetRole = await prisma.user.findFirst({
    where: { id: data.id, deletedAt: null },
    select: { role: true },
  });
  if (!targetRole) throw new Response("User tidak ditemukan.", { status: 404 });
  if (!data.active && targetRole.role === "SUPERADMIN") {
    const activeSuperadmins = await prisma.user.count({
      where: { role: "SUPERADMIN", isActive: true, deletedAt: null },
    });
    if (activeSuperadmins <= 1)
      throw new Response("Superadmin aktif terakhir tidak dapat dinonaktifkan.", { status: 400 });
  }

  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    const target = await prisma.user.findFirst({
      where: {
        id: data.id,
        deletedAt: null,
        role: "USER",
        assignedRegions: { some: { regionId: { in: regionIds ?? [] } } },
      },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  const updated = await prisma.user.updateMany({
    where: { id: data.id, deletedAt: null },
    data: { isActive: data.active },
  });
  if (updated.count === 0) throw new Response("User tidak ditemukan.", { status: 404 });
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
      where: {
        id: data.id,
        deletedAt: null,
        role: "USER",
        assignedRegions: { some: { regionId: { in: regionIds ?? [] } } },
      },
      select: { id: true },
    });
    if (!target) throw new Response("Forbidden", { status: 403 });
  }

  const target = await prisma.user.findFirst({
    where: { id: data.id, deletedAt: null },
    select: { role: true },
  });
  if (!target) throw new Response("User tidak ditemukan.", { status: 404 });
  if (target.role === "SUPERADMIN") {
    const superadminCount = await prisma.user.count({
      where: { role: "SUPERADMIN", isActive: true, deletedAt: null },
    });
    if (superadminCount <= 1) throw new Response("Superadmin terakhir tidak dapat dihapus.", { status: 400 });
  }

  // Anonymize instead of hard-deleting: history (activity, irrigation, email,
  // alerts) must survive and the unique email must be freed for re-registration.
  const anonymizedPasswordHash = await hashPassword(newOpaqueToken(32));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: data.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: data.id } });
      await tx.userProfile.deleteMany({ where: { userId: data.id } });
      await tx.indicatorThreshold.deleteMany({ where: { userId: data.id } });

      await tx.adminRegionAssignment.deleteMany({ where: { adminId: data.id } });
      await tx.userRegionAssignment.deleteMany({ where: { userId: data.id } });

      await tx.adminRegionAssignment.updateMany({
        where: { assignedById: data.id },
        data: { assignedById: session.id },
      });
      await tx.userRegionAssignment.updateMany({
        where: { assignedById: data.id },
        data: { assignedById: session.id },
      });
      await tx.region.updateMany({ where: { createdById: data.id }, data: { createdById: session.id } });
      await tx.region.updateMany({ where: { updatedById: data.id }, data: { updatedById: session.id } });
      await tx.block.updateMany({ where: { createdById: data.id }, data: { createdById: session.id } });
      await tx.block.updateMany({ where: { updatedById: data.id }, data: { updatedById: session.id } });

      const anonymized = await tx.user.updateMany({
        where: { id: data.id, deletedAt: null },
        data: {
          email: `deleted+${data.id}@deleted.invalid`,
          name: "Pengguna Dihapus",
          passwordHash: anonymizedPasswordHash,
          isActive: false,
          deletedAt: new Date(),
        },
      });
      if (anonymized.count === 0) {
        throw new Response("User tidak ditemukan.", { status: 404 });
      }
    });
  } catch (error) {
    mapKnownUserErrors(error);
  }

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

  const createdUser = await prisma
    .$transaction(async (tx) => {
      const user = await tx.user.create({
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
        select: { id: true, name: true, email: true, role: true },
      });

      if (role === "ADMIN") {
        await tx.adminRegionAssignment.createMany({
          data: regionIds.map((regionId) => ({ adminId: user.id, regionId, assignedById: session.id })),
          skipDuplicates: true,
        });
      }
      if (role === "USER") {
        await tx.userRegionAssignment.create({
          data: { userId: user.id, regionId: regionIds[0], assignedById: session.id },
        });
        await tx.indicatorThreshold.upsert({
          where: { userId_regionId: { userId: user.id, regionId: regionIds[0] } },
          update: {},
          create: {
            userId: user.id,
            regionId: regionIds[0],
            ...displayThresholdDefaults(),
            landPreference: MoistureStatus.LEMBAB,
          },
        });
      }

      return user;
    })
    .catch((error: unknown) => mapKnownUserErrors(error));

  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "User",
    entityId: createdUser.id,
  });
  sendWelcomeUserEmail({
    recipientId: createdUser.id,
    to: createdUser.email,
    name: createdUser.name,
    email: createdUser.email,
    password: data.password,
    loginUrl: `${serverConfig.appOrigin}/login`,
  }).catch((err: unknown) => console.error("[email] welcomeUser:", err));
  return { id: createdUser.id, name: createdUser.name, email: createdUser.email, role: createdUser.role, apiKey };
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

  const existing = await prisma.user.findFirst({
    where: { id: data.id, deletedAt: null },
    include: { assignedRegions: true, administeredRegions: true },
  });
  if (!existing) throw new Response("User tidak ditemukan.", { status: 404 });
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
    const activeSuperadmins = await prisma.user.count({
      where: { role: "SUPERADMIN", isActive: true, deletedAt: null },
    });
    if (activeSuperadmins <= 1) {
      throw new Response("Superadmin aktif terakhir tidak dapat diturunkan role-nya.", { status: 400 });
    }
  }
  const fallbackRegionIds =
    role === "ADMIN"
      ? existing.administeredRegions.map((a) => a.regionId)
      : existing.assignedRegions.map((a) => a.regionId);
  const regionIds = await assertRegionsAssignable(session, data.regionIds ?? fallbackRegionIds, role);
  const nextEmail = data.email.trim().toLowerCase();
  const invalidateSessions = existing.email !== nextEmail || existing.role !== role;

  await prisma
    .$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.id, deletedAt: null },
        data: { name: data.name.trim(), email: nextEmail, role },
      });
      await tx.userProfile.upsert({
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
      });

      // Replace assignments inside the same transaction so there is no window
      // where the user temporarily has no region at all.
      await tx.adminRegionAssignment.deleteMany({ where: { adminId: data.id } });
      await tx.userRegionAssignment.deleteMany({ where: { userId: data.id } });
      if (role === "ADMIN") {
        await tx.adminRegionAssignment.createMany({
          data: regionIds.map((regionId) => ({ adminId: data.id, regionId, assignedById: session.id })),
          skipDuplicates: true,
        });
      }
      if (role === "USER") {
        await tx.userRegionAssignment.create({
          data: { userId: data.id, regionId: regionIds[0], assignedById: session.id },
        });
        await tx.indicatorThreshold.upsert({
          where: { userId_regionId: { userId: data.id, regionId: regionIds[0] } },
          update: {},
          create: {
            userId: data.id,
            regionId: regionIds[0],
            ...displayThresholdDefaults(),
            landPreference: MoistureStatus.LEMBAB,
          },
        });
      }

      if (invalidateSessions) {
        await tx.session.deleteMany({ where: { userId: data.id } });
      }
    })
    .catch((error: unknown) => mapKnownUserErrors(error));

  await logActivity({ actorId: session.id, action: ActivityAction.UPDATE, entityType: "User", entityId: data.id });
  return { ok: true };
}
