"use server";

import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { getPublicCached, invalidateLandingAndPublish } from "../cache";
import { cacheKeys, LANDING_TTL_MS } from "../cache/keys";
import { prisma } from "../db/prisma";
import { assertSuperadmin, sanitizeImageUrl } from "../auth/security";
import { getSession } from "../auth/session";
import {
  idInputSchema,
  landingLocationSchema,
  landingPartnerSchema,
  landingTestimonialSchema,
  parseInput,
} from "../validation";
import { logActivity } from "../domain";

async function requireSuperadmin() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  return assertSuperadmin(session);
}

/**
 * Public active-only lists. The `try/catch` stays outside `getPublicCached` so
 * a database failure returns `[]` to the page without caching that fallback.
 */
export async function getLandingTestimonials() {
  try {
    return await getPublicCached(
      cacheKeys.landing.testimonials,
      async () => {
        const rows = await prisma.landingTestimonial.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, role: true, quote: true, imageUrl: true, sortOrder: true, isActive: true },
        });
        return rows.map((row) => ({ ...row, imageUrl: sanitizeImageUrl(row.imageUrl) }));
      },
      LANDING_TTL_MS,
    );
  } catch {
    return [];
  }
}

export async function getLandingLocations() {
  try {
    return await getPublicCached(
      cacheKeys.landing.locations,
      async () => {
        const rows = await prisma.landingLocation.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            sortOrder: true,
            isActive: true,
          },
        });
        return rows.map((row) => ({ ...row, imageUrl: sanitizeImageUrl(row.imageUrl) }));
      },
      LANDING_TTL_MS,
    );
  } catch {
    return [];
  }
}

export async function getLandingPartners() {
  try {
    return await getPublicCached(
      cacheKeys.landing.partners,
      async () => {
        const rows = await prisma.landingPartner.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, logoUrl: true, websiteUrl: true, sortOrder: true, isActive: true },
        });
        return rows.map((row) => ({
          ...row,
          logoUrl: sanitizeImageUrl(row.logoUrl),
          websiteUrl: row.websiteUrl && /^https?:\/\//i.test(row.websiteUrl) ? row.websiteUrl : null,
        }));
      },
      LANDING_TTL_MS,
    );
  } catch {
    return [];
  }
}

export async function getAllTestimonials() {
  await requireSuperadmin();
  return prisma.landingTestimonial.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getAllLocations() {
  await requireSuperadmin();
  return prisma.landingLocation.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function getAllPartners() {
  await requireSuperadmin();
  return prisma.landingPartner.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function createTestimonial(input: {
  name: string;
  role: string;
  quote: string;
  imageUrl?: string;
  sortOrder?: number;
}) {
  const data = parseInput(landingTestimonialSchema, input);
  const session = await requireSuperadmin();
  const item = await prisma.landingTestimonial.create({
    data: {
      name: data.name,
      role: data.role,
      quote: data.quote,
      imageUrl: data.imageUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("testimonials");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingTestimonial",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updateTestimonial(input: {
  id?: string;
  name: string;
  role: string;
  quote: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const data = parseInput(landingTestimonialSchema, input);
  if (!data.id) throw new Response("ID testimoni wajib diisi.", { status: 400 });
  const session = await requireSuperadmin();
  await prisma.landingTestimonial.update({
    where: { id: data.id },
    data: {
      name: data.name,
      role: data.role,
      quote: data.quote,
      imageUrl: data.imageUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("testimonials");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingTestimonial",
    entityId: data.id,
  });
  return { ok: true };
}

export async function deleteTestimonial(id: string) {
  const data = parseInput(idInputSchema, { id });
  const session = await requireSuperadmin();
  await prisma.landingTestimonial.delete({ where: { id: data.id } });
  await invalidateLandingAndPublish("testimonials");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingTestimonial",
    entityId: data.id,
  });
  return { ok: true };
}

export async function createLocation(input: {
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder?: number;
}) {
  const data = parseInput(landingLocationSchema, input);
  const session = await requireSuperadmin();
  const item = await prisma.landingLocation.create({
    data: {
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("locations");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingLocation",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updateLocation(input: {
  id?: string;
  name: string;
  description: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const data = parseInput(landingLocationSchema, input);
  if (!data.id) throw new Response("ID lokasi wajib diisi.", { status: 400 });
  const session = await requireSuperadmin();
  await prisma.landingLocation.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("locations");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingLocation",
    entityId: data.id,
  });
  return { ok: true };
}

export async function deleteLocation(id: string) {
  const data = parseInput(idInputSchema, { id });
  const session = await requireSuperadmin();
  await prisma.landingLocation.delete({ where: { id: data.id } });
  await invalidateLandingAndPublish("locations");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingLocation",
    entityId: data.id,
  });
  return { ok: true };
}

export async function createPartner(input: {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  sortOrder?: number;
}) {
  const data = parseInput(landingPartnerSchema, input);
  const session = await requireSuperadmin();
  const item = await prisma.landingPartner.create({
    data: {
      name: data.name,
      logoUrl: data.logoUrl ?? null,
      websiteUrl: data.websiteUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("partners");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "LandingPartner",
    entityId: item.id,
  });
  return { ok: true };
}

export async function updatePartner(input: {
  id?: string;
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const data = parseInput(landingPartnerSchema, input);
  if (!data.id) throw new Response("ID mitra wajib diisi.", { status: 400 });
  const session = await requireSuperadmin();
  await prisma.landingPartner.update({
    where: { id: data.id },
    data: {
      name: data.name,
      logoUrl: data.logoUrl ?? null,
      websiteUrl: data.websiteUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  await invalidateLandingAndPublish("partners");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "LandingPartner",
    entityId: data.id,
  });
  return { ok: true };
}

export async function deletePartner(id: string) {
  const data = parseInput(idInputSchema, { id });
  const session = await requireSuperadmin();
  await prisma.landingPartner.delete({ where: { id: data.id } });
  await invalidateLandingAndPublish("partners");
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "LandingPartner",
    entityId: data.id,
  });
  return { ok: true };
}
