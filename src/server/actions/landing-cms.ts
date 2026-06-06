"use server";

import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";
import { logActivity } from "./_helpers";

type LandingTestimonial = {
  id: string;
  name: string;
  role: string;
  quote: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type LandingLocation = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type LandingPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function getLandingTestimonials(): Promise<LandingTestimonial[]> {
  try {
     
    return await (prisma as any).landingTestimonial.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

export async function getLandingLocations(): Promise<LandingLocation[]> {
  try {
     
    return await (prisma as any).landingLocation.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

export async function getLandingPartners(): Promise<LandingPartner[]> {
  try {
     
    return await (prisma as any).landingPartner.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

export async function getAllTestimonials() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  return prisma.landingTestimonial.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getAllLocations() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  return prisma.landingLocation.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getAllPartners() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  return prisma.landingPartner.findMany({ orderBy: { sortOrder: "asc" } });
}

// ── Testimonials CRUD ────────────────────────────────────────────────────────

export async function createTestimonial(input: {
  name: string;
  role: string;
  quote: string;
  imageUrl?: string;
  sortOrder?: number;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  if (!input.name.trim() || !input.role.trim() || !input.quote.trim())
    throw new Response("Nama, peran, dan kutipan wajib diisi.", { status: 400 });
  const item = await prisma.landingTestimonial.create({
    data: {
      name: input.name.trim(),
      role: input.role.trim(),
      quote: input.quote.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingTestimonial",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updateTestimonial(input: {
  id: string;
  name: string;
  role: string;
  quote: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingTestimonial.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      role: input.role.trim(),
      quote: input.quote.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingTestimonial",
    entityId: input.id,
  });
  return { ok: true };
}

export async function deleteTestimonial(id: string) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingTestimonial.delete({ where: { id } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingTestimonial",
    entityId: id,
  });
  return { ok: true };
}

export async function createLocation(input: {
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder?: number;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  if (!input.name.trim() || !input.description.trim())
    throw new Response("Nama dan deskripsi wajib diisi.", { status: 400 });
  const item = await prisma.landingLocation.create({
    data: {
      name: input.name.trim(),
      description: input.description.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingLocation",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updateLocation(input: {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingLocation.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      description: input.description.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingLocation",
    entityId: input.id,
  });
  return { ok: true };
}

export async function deleteLocation(id: string) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingLocation.delete({ where: { id } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingLocation",
    entityId: id,
  });
  return { ok: true };
}

export async function createPartner(input: {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  sortOrder?: number;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  if (!input.name.trim()) throw new Response("Nama mitra wajib diisi.", { status: 400 });
  const item = await prisma.landingPartner.create({
    data: {
      name: input.name.trim(),
      logoUrl: input.logoUrl?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingPartner",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updatePartner(input: {
  id: string;
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingPartner.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      logoUrl: input.logoUrl?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingPartner",
    entityId: input.id,
  });
  return { ok: true };
}

export async function deletePartner(id: string) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.landingPartner.delete({ where: { id } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingPartner",
    entityId: id,
  });
  return { ok: true };
}
