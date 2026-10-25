"use server";

import { redirect } from "@solidjs/router";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../auth/security";
import { getSession } from "../auth/session";
import { getScopedRegionIds } from "../domain";
import { adminOptionsSchema, blockOptionsSchema, parseInput, regionOptionsSchema } from "../validation";
import { formatBlockName } from "~/lib/shared/irrigation";

export type PickerOption = { value: string; label: string };

/** Regions the caller may select (same scoping as getMyRegions), filtered by name on the server. */
export async function searchRegionOptions(input: { query?: string; limit?: number }): Promise<PickerOption[]> {
  const data = parseInput(regionOptionsSchema, input ?? {});
  const session = await getSession();
  if (!session) throw redirect("/login");

  const regionIds = await getScopedRegionIds(session);
  const where: Prisma.RegionWhereInput = {
    ...(regionIds ? { id: { in: regionIds } } : {}),
    ...(data.query ? { name: { contains: data.query } } : {}),
  };
  const rows = await prisma.region.findMany({
    where,
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: data.limit,
  });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** Number of regions in the caller's scope; lets pages decide whether a region picker is worth showing. */
export async function countMyRegions(): Promise<number> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  const regionIds = await getScopedRegionIds(session);
  return regionIds ? regionIds.length : prisma.region.count();
}

/** Blocks inside the caller's regions (same scoping as getMyBlocks), optionally narrowed to one region. */
export async function searchBlockOptions(input: {
  query?: string;
  limit?: number;
  regionId?: string;
}): Promise<PickerOption[]> {
  const data = parseInput(blockOptionsSchema, input ?? {});
  const session = await getSession();
  if (!session) throw redirect("/login");

  const regionIds = await getScopedRegionIds(session);
  const and: Prisma.BlockWhereInput[] = [];
  if (regionIds) and.push({ regionId: { in: regionIds } });
  if (data.regionId) and.push({ regionId: data.regionId });
  if (data.query) {
    and.push({ OR: [{ name: { contains: data.query } }, { region: { name: { contains: data.query } } }] });
  }
  const rows = await prisma.block.findMany({
    where: and.length ? { AND: and } : undefined,
    select: { id: true, name: true, region: { select: { name: true } } },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
    take: data.limit,
  });
  return rows.map((b) => ({ value: b.id, label: `${b.region.name} - ${formatBlockName(b.name)}` }));
}

/** Active admins for the assign-admin picker. SUPERADMIN only (same as getAdmins). */
export async function searchAdminOptions(input: {
  query?: string;
  limit?: number;
  excludeRegionId?: string;
}): Promise<PickerOption[]> {
  const data = parseInput(adminOptionsSchema, input ?? {});
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const and: Prisma.UserWhereInput[] = [{ role: "ADMIN", isActive: true }];
  if (data.excludeRegionId) and.push({ administeredRegions: { none: { regionId: data.excludeRegionId } } });
  if (data.query) and.push({ OR: [{ name: { contains: data.query } }, { email: { contains: data.query } }] });
  const rows = await prisma.user.findMany({
    where: { AND: and },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: data.limit,
  });
  return rows.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));
}
