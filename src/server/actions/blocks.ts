"use server";

import { ActivityAction, IrrigationMode, Prisma, RelayState, SyncStatus, type IrrigationEvent } from "@prisma/client";
import { redirect } from "@solidjs/router";
import type { BlockCreateResult } from "~/types/map";
import { prisma } from "../db/prisma";
import {
  provisionBlockNode,
  provisionSprayerNode,
  renameBlockNode,
  updateSprayerControl,
} from "../integrations/firebase";
import { assertAdminOrHigher } from "../auth/security";
import { getSession } from "../auth/session";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { decimalToString, getScopedRegionIds, logActivity } from "../domain";
import {
  createBlockSchema,
  createSprayerSchema,
  overridePumpSchema,
  parseInput,
  updateBlockSchema,
} from "../validation";

/**
 * Per-sprayer promise tails used to serialize pump control inside this process.
 * The row lock inside the event transaction still guards the database across
 * instances; this tail additionally keeps the hardware command and the event
 * recording for one sprayer from interleaving (for example an ON and an OFF
 * crossing each other). Keys are sprayer ids, so unrelated sprayers never
 * block one another.
 */
const pumpControlTails = new Map<string, Promise<void>>();

async function withPumpControlLock<T>(sprayerId: string, fn: () => Promise<T>): Promise<T> {
  const previous = pumpControlTails.get(sprayerId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  pumpControlTails.set(sprayerId, tail);

  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (pumpControlTails.get(sprayerId) === tail) pumpControlTails.delete(sprayerId);
  }
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createBlock(input: {
  regionId: string;
  name: string;
  areaHectare?: string | null;
}): Promise<BlockCreateResult> {
  const data = parseInput(createBlockSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  const actor = assertAdminOrHigher(session);
  if (session.role === "ADMIN") {
    const scoped = await getScopedRegionIds(session);
    if (!scoped?.includes(data.regionId)) throw new Response("Forbidden", { status: 403 });
  }

  const region = await prisma.region.findUnique({
    where: { id: data.regionId },
    select: { id: true, name: true },
  });
  if (!region) throw new Response("Region tidak ditemukan.", { status: 404 });

  let block: {
    id: string;
    regionId: string;
    name: string;
    areaHectare: { toString(): string } | null;
    firebaseSyncStatus: SyncStatus;
  };
  try {
    block = await prisma.block.create({
      data: {
        regionId: region.id,
        name: data.name,
        areaHectare: data.areaHectare,
        createdById: actor.id,
        firebaseSyncStatus: SyncStatus.PENDING,
      },
      select: { id: true, regionId: true, name: true, areaHectare: true, firebaseSyncStatus: true },
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new Response("Block dengan nama tersebut sudah ada di region ini.", { status: 409 });
    }
    throw error;
  }

  let synced = false;
  try {
    await provisionBlockNode({ regionName: region.name, blockName: block.name });
    synced = true;
  } catch (error) {
    console.error("[block] Firebase provisioning failed", error);
    synced = false;
  }

  const result = await prisma.block.update({
    where: { id: block.id },
    data: synced
      ? { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() }
      : { firebaseSyncStatus: SyncStatus.FAILED },
    select: { id: true, regionId: true, name: true, areaHectare: true, firebaseSyncStatus: true },
  });

  // Audit once, outside the Firebase try/catch: a successful provision must not
  // be reported as FAILED because the audit insert failed, and a failed
  // provision must not produce a second audit row.
  await logActivity({
    actorId: actor.id,
    regionId: region.id,
    action: ActivityAction.CREATE,
    entityType: "Block",
    entityId: block.id,
  }).catch((error: unknown) => console.error("[block] audit log failed", error));

  return {
    id: result.id,
    regionId: result.regionId,
    name: result.name,
    areaHectare: decimalToString(result.areaHectare),
    firebaseSyncStatus: result.firebaseSyncStatus,
  };
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
  let updated: Awaited<ReturnType<typeof prisma.block.update>>;
  try {
    updated = await prisma.block.update({
      where: { id: data.id },
      data: {
        name: data.name,
        areaHectare: data.areaHectare,
        updatedById: actor.id,
        firebaseSyncStatus: SyncStatus.PENDING,
      },
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new Response("Block dengan nama tersebut sudah ada di region ini.", { status: 409 });
    }
    throw error;
  }

  let synced = false;
  try {
    await renameBlockNode(existing.name, { regionName: existing.region.name, blockName: updated.name });
    synced = true;
  } catch {
    synced = false;
  }

  const result = synced
    ? await prisma.block.update({
        where: { id: updated.id },
        data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
      })
    : await prisma.block.update({ where: { id: updated.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });

  await logActivity({
    actorId: actor.id,
    regionId: existing.regionId,
    action: ActivityAction.UPDATE,
    entityType: "Block",
    entityId: updated.id,
  }).catch(() => undefined);

  return result;
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

  // Region-level thresholds are authoritative once the region has sprayers.
  // Only the first sprayer in a region may initialize them from the submitted
  // values; later sprayers inherit the existing region configuration. The
  // decision is made inside the transaction under a region row lock so two
  // concurrent first-sprayer requests cannot both initialize.
  let created: Awaited<ReturnType<typeof prisma.sprayer.create>>;
  let dryMaxPercent: number;
  let wetMinPercent: number;
  try {
    ({ created, dryMaxPercent, wetMinPercent } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM region WHERE id = ${block.regionId} FOR UPDATE`;
      const region = await tx.region.findUniqueOrThrow({ where: { id: block.regionId } });
      const sprayersInRegion = await tx.sprayer.count({ where: { block: { regionId: block.regionId } } });
      const initializesRegion = sprayersInRegion === 0;
      const dry = initializesRegion ? data.dryMaxPercent : region.dryMaxPercent;
      const wet = initializesRegion ? data.wetMinPercent : region.wetMinPercent;

      const row = await tx.sprayer.create({
        data: {
          blockId: block.id,
          hardwareId: data.hardwareId,
          displayName: data.displayName,
          firebaseSyncStatus: SyncStatus.PENDING,
        },
      });
      if (initializesRegion) {
        await tx.region.update({
          where: { id: block.regionId },
          data: { dryMaxPercent: dry, wetMinPercent: wet, updatedById: actor.id },
        });
      }
      return { created: row, dryMaxPercent: dry, wetMinPercent: wet };
    }));
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new Response("Hardware ID sudah digunakan oleh sprayer lain.", { status: 409 });
    }
    throw error;
  }
  const sprayer = created;

  let synced = false;
  try {
    await provisionSprayerNode({
      regionName: block.region.name,
      blockName: block.name,
      hardwareId: sprayer.hardwareId,
      dryMaxPercent,
      wetMinPercent,
    });
    synced = true;
  } catch {
    synced = false;
  }

  const result = synced
    ? await prisma.sprayer.update({
        where: { id: sprayer.id },
        data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
      })
    : await prisma.sprayer.update({ where: { id: sprayer.id }, data: { firebaseSyncStatus: SyncStatus.FAILED } });

  await logActivity({
    actorId: actor.id,
    regionId: block.regionId,
    action: ActivityAction.CREATE,
    entityType: "Sprayer",
    entityId: sprayer.id,
  }).catch(() => undefined);

  return result;
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
  if (!sprayer.isActive) throw new Response("Sprayer tidak aktif.", { status: 409 });

  return withPumpControlLock(sprayer.id, async () => {
    const hardware = {
      regionName: sprayer.block.region.name,
      blockName: sprayer.block.name,
      hardwareId: sprayer.hardwareId,
      mode: data.mode,
    } as const;

    let event: IrrigationEvent | null;

    if (data.relay === "ON") {
      // Record intent first without holding the transaction across the network
      // call, so a created event can be compensated if the relay never acks.
      const onResult = await prisma.$transaction(async (tx): Promise<{ event: IrrigationEvent; created: boolean }> => {
        // Lock the sprayer row so two concurrent overrides cannot both
        // create an open ON event.
        await tx.$queryRaw`SELECT id FROM sprayer WHERE id = ${sprayer.id} FOR UPDATE`;

        const existing = await tx.irrigationEvent.findFirst({
          where: { sprayerId: sprayer.id, relay: RelayState.ON, endedAt: null },
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        });
        if (existing) return { event: existing, created: false };

        const created = await tx.irrigationEvent.create({
          data: {
            sprayerId: sprayer.id,
            actorId: session.id,
            mode: data.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
            relay: RelayState.ON,
            reason: "Manual dashboard override",
            startedAt: new Date(),
          },
        });
        return { event: created, created: true };
      });

      try {
        await updateSprayerControl({ ...hardware, relay: "ON" });
      } catch (error) {
        console.error("[pump] ON command failed", error);
        if (onResult.created) {
          // The relay never acknowledged ON: close the optimistic event and
          // make a best-effort attempt to leave the pump off.
          await prisma.irrigationEvent
            .update({
              where: { id: onResult.event.id },
              data: { endedAt: new Date(), durationSeconds: 0 },
            })
            .catch((rollbackError: unknown) =>
              console.error("[pump] failed to close event after ON command failure", rollbackError),
            );
          await updateSprayerControl({ ...hardware, relay: "OFF" }).catch((offError: unknown) =>
            console.error("[pump] failed to send compensating OFF command", offError),
          );
        }
        throw new Response("Perintah menyalakan pompa gagal dikirim ke perangkat.", { status: 502 });
      }

      event = onResult.event;
    } else {
      // OFF is the safe direction: stop the hardware before touching the DB.
      try {
        await updateSprayerControl({ ...hardware, relay: "OFF" });
      } catch (error) {
        console.error("[pump] OFF command failed", error);
        throw new Response("Perintah mematikan pompa gagal dikirim ke perangkat.", { status: 502 });
      }

      try {
        event = await prisma.$transaction(async (tx): Promise<IrrigationEvent | null> => {
          // Lock the sprayer row so two concurrent overrides cannot close the
          // same event twice.
          await tx.$queryRaw`SELECT id FROM sprayer WHERE id = ${sprayer.id} FOR UPDATE`;

          const openEvent = await tx.irrigationEvent.findFirst({
            where: { sprayerId: sprayer.id, relay: RelayState.ON, endedAt: null },
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
          });
          if (!openEvent) return null;

          const endedAt = new Date();
          const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - openEvent.startedAt.getTime()) / 1000));
          return tx.irrigationEvent.update({
            where: { id: openEvent.id },
            data: { endedAt, durationSeconds },
          });
        });
      } catch (error) {
        // Hardware is already off; never re-enable it just because the event
        // record could not be closed.
        console.error("[pump] failed to record OFF event", error);
        throw new Response("Pompa sudah dimatikan, tetapi event irigasi gagal diperbarui.", {
          status: 502,
        });
      }
    }

    // Only a fully successful request is audited.
    await logActivity({
      actorId: session.id,
      regionId: sprayer.block.regionId,
      action: ActivityAction.CONTROL_OVERRIDE,
      entityType: "Sprayer",
      entityId: sprayer.id,
    });

    return event;
  });
}
