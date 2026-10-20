"use server";

import { ActivityAction, IrrigationMode, RelayState, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import {
  provisionBlockNode,
  provisionSprayerNode,
  renameBlockNode,
  updateSprayerControl,
} from "../services/firebaseSync";
import { assertAdminOrHigher } from "../security";
import { getSession } from "../session";
import { checkRateLimit, rateLimitResponse } from "../rateLimit";
import { getScopedRegionIds, logActivity } from "./_helpers";
import {
  createBlockSchema,
  createSprayerSchema,
  overridePumpSchema,
  parseInput,
  updateBlockSchema,
} from "../validation";

export async function createBlock(input: {
  regionId: string;
  name: string;
  areaHectare?: string;
  description?: string;
}) {
  const data = parseInput(createBlockSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertAdminOrHigher(session);
  if (session.role === "ADMIN") {
    const scoped = await getScopedRegionIds(session);
    if (!scoped?.includes(data.regionId)) throw new Response("Forbidden", { status: 403 });
  }
  const region = await prisma.region.findUniqueOrThrow({ where: { id: data.regionId } });
  const block = await prisma.block.create({
    data: {
      regionId: region.id,
      name: data.name,
      areaHectare: data.areaHectare,
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
  } catch {
    await prisma.block.update({ where: { id: block.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    await logActivity({
      actorId: actor.id,
      regionId: region.id,
      blockId: block.id,
      action: ActivityAction.CREATE,
      entityType: "Block",
      entityId: block.id,
    }).catch(() => undefined);
    return prisma.block.findUniqueOrThrow({ where: { id: block.id } });
  }
}

export async function updateBlock(input: { id: string; name: string; areaHectare?: string }) {
  const data = parseInput(updateBlockSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertAdminOrHigher(session);
  const existing = await prisma.block.findUniqueOrThrow({ where: { id: data.id }, include: { region: true } });
  if (session.role === "ADMIN") {
    const scoped = await getScopedRegionIds(session);
    if (!scoped?.includes(existing.regionId)) throw new Response("Forbidden", { status: 403 });
  }
  const updated = await prisma.block.update({
    where: { id: data.id },
    data: {
      name: data.name,
      areaHectare: data.areaHectare,
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
  } catch {
    await prisma.block.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    await logActivity({
      actorId: actor.id,
      regionId: existing.regionId,
      blockId: updated.id,
      action: ActivityAction.UPDATE,
      entityType: "Block",
      entityId: updated.id,
    }).catch(() => undefined);
    return prisma.block.findUniqueOrThrow({ where: { id: updated.id } });
  }
}

export async function createSprayer(input: {
  blockId: string;
  hardwareId: string;
  displayName: string;
  dryMaxPercent: number;
  wetMinPercent: number;
}) {
  const data = parseInput(createSprayerSchema, input);
  if (data.dryMaxPercent >= data.wetMinPercent) {
    throw new Response("Batas kering harus lebih kecil dari batas basah.", { status: 400 });
  }
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertAdminOrHigher(session);
  const block = await prisma.block.findUniqueOrThrow({ where: { id: data.blockId }, include: { region: true } });
  if (session.role === "ADMIN") {
    const scoped = await getScopedRegionIds(session);
    if (!scoped?.includes(block.regionId)) throw new Response("Forbidden", { status: 403 });
  }
  const sprayer = await prisma.sprayer.create({
    data: {
      blockId: block.id,
      hardwareId: data.hardwareId,
      displayName: data.displayName,
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionSprayerNode({
      regionName: block.region.name,
      blockName: block.name,
      hardwareId: sprayer.hardwareId,
      dryMaxPercent: data.dryMaxPercent,
      wetMinPercent: data.wetMinPercent,
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
  } catch {
    await prisma.sprayer.update({ where: { id: sprayer.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });
    await logActivity({
      actorId: actor.id,
      regionId: block.regionId,
      blockId: block.id,
      action: ActivityAction.CREATE,
      entityType: "Sprayer",
      entityId: sprayer.id,
    }).catch(() => undefined);
    return prisma.sprayer.findUniqueOrThrow({ where: { id: sprayer.id } });
  }
}

export async function overridePump(input: { sprayerId: string; mode: "AUTO" | "MANUAL"; relay: "OFF" | "ON" }) {
  const data = parseInput(overridePumpSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "ADMIN") {
    throw new Response("Admin hanya dapat melihat data dan tidak dapat melakukan kontrol pompa.", { status: 403 });
  }

  const controlLimit = checkRateLimit(`pump:user:${session.id}`, 30, 60_000);
  if (!controlLimit.allowed) throw rateLimitResponse(controlLimit);

  const sprayer = await prisma.sprayer.findUniqueOrThrow({
    where: { id: data.sprayerId },
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
    mode: data.mode,
    relay: data.relay,
  });

  let event;
  if (data.relay === "ON") {
    event = await prisma.irrigationEvent.create({
      data: {
        blockId: sprayer.blockId,
        sprayerId: sprayer.id,
        actorId: session.id,
        mode: data.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
        relay: RelayState.ON,
        reason: "Manual dashboard override",
        startedAt: new Date(),
      },
    });
  } else {
    const openEvent = await prisma.irrigationEvent.findFirst({
      where: { sprayerId: sprayer.id, relay: RelayState.ON, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (openEvent) {
      const endedAt = new Date();
      const durationSeconds = Math.round((endedAt.getTime() - openEvent.startedAt.getTime()) / 1000);
      event = await prisma.irrigationEvent.update({
        where: { id: openEvent.id },
        data: { endedAt, durationSeconds },
      });
    }
  }

  await logActivity({
    actorId: session.id,
    regionId: sprayer.block.regionId,
    blockId: sprayer.blockId,
    action: ActivityAction.CONTROL_OVERRIDE,
    entityType: "Sprayer",
    entityId: sprayer.id,
  });

  return event ?? null;
}
