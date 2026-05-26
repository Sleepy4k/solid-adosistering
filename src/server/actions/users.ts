"use server";

import { randomBytes } from "node:crypto";
import type { Role, Prisma } from "@prisma/client";
import { ActivityAction, MoistureStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertAdminOrHigher, assertSuperadmin, hashPassword, type SessionUser } from "../security";
import { getSession } from "../session";
import { assertRegionsAssignable, displayThresholdDefaults, getScopedRegionIds, logActivity } from "./_helpers";
import type { UserListItem } from "~/types/users";

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
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertAdminOrHigher(session);

  const scopedRegionIds = await getScopedRegionIds(session);
  const where: Prisma.UserWhereInput =
    session.role === "ADMIN"
      ? { role: "USER", assignedRegions: { some: { regionId: { in: scopedRegionIds ?? [] } } } }
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
    regions: u.role === "ADMIN" ? u.administeredRegions.map((a) => a.region) : u.assignedRegions.map((a) => a.region),
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
    action: ActivityAction.UPDATE,
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
    include: { assignedRegions: true, administeredRegions: true },
  });
  if (session.role === "ADMIN") {
    const scopedRegionIds = await getScopedRegionIds(session);
    const inScope =
      existing.role === "USER" && existing.assignedRegions.some((a) => (scopedRegionIds ?? []).includes(a.regionId));
    if (!inScope) throw new Response("Forbidden", { status: 403 });
  }

  const role = session.role === "ADMIN" ? "USER" : input.role;
  const fallbackRegionIds =
    role === "ADMIN"
      ? existing.administeredRegions.map((a) => a.regionId)
      : existing.assignedRegions.map((a) => a.regionId);
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
