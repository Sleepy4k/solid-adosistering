"use server";

import { ActivityAction, MoistureStatus, Prisma, type Role } from "@prisma/client";
import type { UserListItem } from "~/types/users";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendWelcomeUserEmail } from "../integrations/email";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { issuePasswordSetupToken, PASSWORD_SETUP_TTL_HOURS } from "../auth/passwordSetup";
import { resolveSort } from "~/lib/shared/tableSort";
import { USER_SORT_KEYS, type UserSortKey } from "~/lib/shared/userSort";
import { assertAdminOrHigher, hashPassword, newOpaqueToken } from "../auth/security";
import { destroyAllUserSessions, getSession } from "../auth/session";
import { assertRegionsAssignable, displayThresholdDefaults, getScopedRegionIds, logActivity } from "../domain";
import { buildUserListWhere } from "../domain/userListQuery";
import {
  createUserSchema,
  deleteUserSchema,
  parseInput,
  resendSetPasswordLinkSchema,
  setUserActiveSchema,
  updateUserSchema,
  userListQuerySchema,
} from "../validation";

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
  if (fields.includes("deviceusername")) return "Data unik sudah digunakan.";
  return "Data yang sama sudah ada.";
}

function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** Prisma P2000: a value is too long for the target column. */
function isLengthConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2000";
}

function mapKnownUserErrors(error: unknown): never {
  if (isUniqueConstraint(error)) throw new Response(uniqueConstraintMessage(error), { status: 409 });
  if (isLengthConstraint(error)) throw new Response("Data yang dikirim terlalu panjang.", { status: 400 });
  if (isMissingRecord(error)) throw new Response("User tidak ditemukan.", { status: 404 });
  throw error;
}

/**
 * Lock every active SUPERADMIN row (`FOR UPDATE`) and return their ids, so two
 * concurrent demote/deactivate/delete transactions serialize instead of both
 * seeing "another superadmin still exists". Must run inside a transaction.
 */
async function lockActiveSuperadminIds(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM \`user\` WHERE role = 'SUPERADMIN' AND is_active = 1 AND deleted_at IS NULL FOR UPDATE
  `;
  return rows.map((row) => row.id);
}

/** Throws (rolling back the transaction) when `targetId` is the only active superadmin. */
async function assertNotLastActiveSuperadmin(tx: Prisma.TransactionClient, targetId: string, message: string) {
  const ids = await lockActiveSuperadminIds(tx);
  if (ids.includes(targetId) && ids.length <= 1) throw new Response(message, { status: 400 });
}

const USER_LIST_DEFAULT_LIMIT = 10;

/** Sort key -> Prisma orderBy. Keys are allow-listed; clients never send columns. */
const USER_ORDER_BY: Record<UserSortKey, (dir: "asc" | "desc") => Prisma.UserOrderByWithRelationInput> = {
  name: (dir) => ({ name: dir }),
  email: (dir) => ({ email: dir }),
  whatsapp: (dir) => ({ profile: { whatsapp: dir } }),
  role: (dir) => ({ role: dir }),
  status: (dir) => ({ isActive: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
};

/** A user with none of these events never logged in nor set a password: still on the unusable initial one. */
const ACTIVATED_ACTIONS = [ActivityAction.AUTH_LOGIN, ActivityAction.AUTH_PASSWORD_RESET_COMPLETE];

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

export async function getUsers(query?: {
  search?: string;
  role?: Role;
  status?: "active" | "inactive";
  sort?: { key: string; dir: "asc" | "desc" };
  limit?: number;
  offset?: number;
}) {
  const parsed = parseInput(userListQuerySchema, query ?? {});
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const limit = Math.min(Math.max(parsed.limit ?? USER_LIST_DEFAULT_LIMIT, 1), 100);
  const offset = Math.max(parsed.offset ?? 0, 0);
  const sort = resolveSort(USER_SORT_KEYS, parsed.sort, { key: "createdAt", dir: "asc" });

  const where = await buildUserListWhere(session, {
    ...(parsed.role ? { role: parsed.role } : {}),
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.status ? { isActive: parsed.status === "active" } : {}),
  });
  if (!where) return { items: [] as UserListItem[], total: 0 };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [USER_ORDER_BY[sort.key](sort.dir), { id: "asc" }],
      take: limit,
      skip: offset,
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
        activityLogs: { where: { action: { in: ACTIVATED_ACTIONS } }, take: 1, select: { id: true } },
      },
    }),
  ]);

  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    whatsapp: u.profile?.whatsapp ?? null,
    pendingSetup: u.activityLogs.length === 0,
    regions: u.role === "ADMIN" ? u.administeredRegions.map((a) => a.region) : u.assignedRegions.map((a) => a.region),
  })) as UserListItem[];
  return { items, total };
}

/** Email the set-password link; returns false (never logging the token) when delivery fails. */
async function sendSetPasswordEmail(user: { id: string; name: string; email: string }, setPasswordUrl: string) {
  try {
    await sendWelcomeUserEmail({
      recipientId: user.id,
      to: user.email,
      name: user.name,
      email: user.email,
      setPasswordUrl,
      expiresInHours: PASSWORD_SETUP_TTL_HOURS,
    });
    return true;
  } catch {
    console.error("[email] welcomeUser: delivery failed");
    return false;
  }
}

export async function resendSetPasswordLink(input: { id: string }) {
  const data = parseInput(resendSetPasswordLinkSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const actorLimit = checkRateLimit(`setpw-resend:${session.id}`, 20, 60 * 60_000);
  if (!actorLimit.allowed) throw rateLimitResponse(actorLimit);

  // Same scoped clause as the list, so an ADMIN can only reach users in their regions.
  const scope = await buildUserListWhere(session);
  if (!scope) throw new Response("User tidak ditemukan.", { status: 404 });
  const target = await prisma.user.findFirst({
    where: { AND: [scope, { id: data.id, isActive: true }] },
    select: { id: true, name: true, email: true },
  });
  if (!target) throw new Response("User tidak ditemukan.", { status: 404 });

  // Only an in-scope target consumes its budget, so an ADMIN cannot burn the
  // resend allowance of users they are not allowed to reach.
  const targetLimit = checkRateLimit(`setpw-resend-target:${target.id}`, 3, 60 * 60_000);
  if (!targetLimit.allowed) throw rateLimitResponse(targetLimit);

  // Earlier links stay valid until the new one was actually delivered.
  const { setPasswordUrl, tokenId } = await prisma.$transaction((tx) =>
    issuePasswordSetupToken(tx, target.id, { revokeOthers: false }),
  );
  const emailSent = await sendSetPasswordEmail(target, setPasswordUrl);
  if (emailSent) {
    await prisma.passwordResetToken.updateMany({
      where: { userId: target.id, usedAt: null, id: { not: tokenId } },
      data: { usedAt: new Date() },
    });
  } else {
    await prisma.passwordResetToken.deleteMany({ where: { id: tokenId } });
  }
  await logActivity({
    actorId: session.id,
    action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
    entityType: "User",
    entityId: target.id,
    metadata: { setupLinkResent: true, emailSent },
  });
  if (!emailSent) throw new Response("Tautan dibuat tetapi email gagal terkirim. Coba lagi nanti.", { status: 502 });
  return { ok: true };
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

  // The last-superadmin guard runs inside the transaction on locked rows; it is
  // a no-op when the target is already inactive (it is not in the locked set).
  const updated = await prisma.$transaction(async (tx) => {
    if (!data.active && targetRole.role === "SUPERADMIN") {
      await assertNotLastActiveSuperadmin(tx, data.id, "Superadmin aktif terakhir tidak dapat dinonaktifkan.");
    }
    return tx.user.updateMany({
      where: { id: data.id, deletedAt: null },
      data: { isActive: data.active },
    });
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

  // Anonymize instead of hard-deleting: history (activity, irrigation, email,
  // alerts) must survive and the unique email must be freed for re-registration.
  const anonymizedPasswordHash = await hashPassword(newOpaqueToken(32));

  try {
    await prisma.$transaction(async (tx) => {
      if (target.role === "SUPERADMIN") {
        await assertNotLastActiveSuperadmin(tx, data.id, "Superadmin terakhir tidak dapat dihapus.");
      }
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
  // Unusable random password: the user sets their own through the emailed link.
  const passwordHash = await hashPassword(newOpaqueToken(32));

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

      const setup = await issuePasswordSetupToken(tx, user.id);
      return { ...user, setPasswordUrl: setup.setPasswordUrl };
    })
    .catch((error: unknown) => mapKnownUserErrors(error));

  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "User",
    entityId: createdUser.id,
  });
  // The user stays created if delivery fails; the admin is told and can resend.
  const emailSent = await sendSetPasswordEmail(createdUser, createdUser.setPasswordUrl);
  return { id: createdUser.id, name: createdUser.name, email: createdUser.email, role: createdUser.role, emailSent };
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
  const demotesSuperadmin = existing.role === "SUPERADMIN" && role !== "SUPERADMIN";
  const fallbackRegionIds =
    role === "ADMIN"
      ? existing.administeredRegions.map((a) => a.regionId)
      : existing.assignedRegions.map((a) => a.regionId);
  const regionIds = await assertRegionsAssignable(session, data.regionIds ?? fallbackRegionIds, role);
  const nextEmail = data.email.trim().toLowerCase();
  const invalidateSessions = existing.email !== nextEmail || existing.role !== role;

  await prisma
    .$transaction(async (tx) => {
      if (demotesSuperadmin) {
        await assertNotLastActiveSuperadmin(tx, data.id, "Superadmin aktif terakhir tidak dapat diturunkan role-nya.");
      }
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
