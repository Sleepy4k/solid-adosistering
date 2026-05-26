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
import { assertAdminOrHigher, type SessionUser } from "../security";
import { getSession } from "../session";
import { getScopedRegionIds, logActivity } from "./_helpers";

export async function createBlock(input: {
  actor: SessionUser;
  regionId: string;
  name: string;
  areaHectare?: string;
  description?: string;
}) {
  const actor = assertAdminOrHigher(input.actor);
  const region = await prisma.region.findUniqueOrThrow({ where: { id: input.regionId } });
  const block = await prisma.block.create({
    data: {
      regionId: region.id,
      name: input.name.trim(),
      areaHectare: input.areaHectare,
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

export async function updateBlock(input: { actor: SessionUser; id: string; name: string; areaHectare?: string }) {
  const actor = assertAdminOrHigher(input.actor);
  const existing = await prisma.block.findUniqueOrThrow({ where: { id: input.id }, include: { region: true } });
  const updated = await prisma.block.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      areaHectare: input.areaHectare,
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
    data: {
      blockId: block.id,
      hardwareId: input.hardwareId.trim(),
      displayName: input.displayName.trim(),
      firebaseSyncStatus: SyncStatus.PENDING,
    },
  });
  try {
    await provisionSprayerNode({
      regionName: block.region.name,
      blockName: block.name,
      hardwareId: sprayer.hardwareId,
      dryMaxPercent: input.dryMaxPercent,
      wetMinPercent: input.wetMinPercent,
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
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "ADMIN") {
    throw new Response("Admin hanya dapat melihat data dan tidak dapat melakukan kontrol pompa.", { status: 403 });
  }

  const sprayer = await prisma.sprayer.findUniqueOrThrow({
    where: { id: input.sprayerId },
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
