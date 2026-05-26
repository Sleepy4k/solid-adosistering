"use server";

import type { MoistureStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { updateRegionSettings } from "../services/firebaseSync";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import {
  displayThresholdDefaults,
  getRegionSafetyTimeoutMap,
  getRegionThresholdMap,
  getSafetyTimeoutDefault,
  getScopedRegionIds,
  normalizeSafetyTimeout,
  normalizePreference,
  SAFETY_TIMEOUT_KEY,
} from "./_helpers";

export async function getMySettings() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const safetyTimeout = await getSafetyTimeoutDefault();

  if (session.role === "SUPERADMIN") {
    return { role: session.role as "SUPERADMIN", regions: [], safetyTimeout };
  }

  if (session.role === "ADMIN") {
    const assignments = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      include: { region: { include: { _count: { select: { blocks: true } } } } },
    });
    const regionIds = assignments.map((a) => a.regionId);
    const thresholdMap = await getRegionThresholdMap(session.id, regionIds);
    const safetyTimeoutMap = await getRegionSafetyTimeoutMap(regionIds, safetyTimeout);

    return {
      role: "ADMIN" as const,
      regions: assignments.map((a) => ({
        id: a.region.id,
        name: a.region.name,
        blockCount: a.region._count.blocks,
        threshold: thresholdMap.get(a.region.id) ?? null,
        safetyTimeout: safetyTimeoutMap.get(a.region.id) ?? safetyTimeout,
      })),
    };
  }

  const assignments = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    include: { region: { include: { _count: { select: { blocks: true } } } } },
  });
  const thresholdMap = await getRegionThresholdMap(
    session.id,
    assignments.map((a) => a.regionId),
  );

  return {
    role: "USER" as const,
    regions: assignments.map((a) => ({
      id: a.region.id,
      name: a.region.name,
      blockCount: a.region._count.blocks,
      threshold: thresholdMap.get(a.region.id) ?? null,
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
  let regionName: string | null = null;

  if (session.role === "USER") {
    const assignment = await prisma.userRegionAssignment.findUnique({
      where: { userId_regionId: { userId: session.id, regionId: input.regionId } },
      include: { region: { select: { name: true } } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses user.", { status: 403 });
    regionName = assignment.region.name;
  } else if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: input.regionId } },
      include: { region: { select: { name: true } } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
    regionName = assignment.region.name;
  } else {
    throw new Response("Pengaturan region hanya tersedia untuk Admin atau User.", { status: 403 });
  }

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

  if (regionName) {
    try {
      await updateRegionSettings({
        regionName,
        dryMaxPercent: input.dryMaxPercent,
        wetMinPercent: input.wetMinPercent,
      });
    } catch {}
  }

  return { ok: true };
}

export async function saveSafetyTimeout(input: { min: number; max: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  const { min, max } = normalizeSafetyTimeout(input);

  await prisma.systemSetting.upsert({
    where: { key: SAFETY_TIMEOUT_KEY },
    create: { key: SAFETY_TIMEOUT_KEY, value: { min, max } },
    update: { value: { min, max } },
  });
  return { ok: true };
}

export async function saveRegionSafetyTimeout(input: { regionId: string; min: number; max: number }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") throw new Response("Pengaturan region hanya tersedia untuk Admin.", { status: 403 });

  if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: input.regionId } },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
  }

  const { min, max } = normalizeSafetyTimeout(input);
  const key = `${SAFETY_TIMEOUT_KEY}:${input.regionId}`;

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: { min, max } },
    update: { value: { min, max } },
  });

  return { ok: true };
}
