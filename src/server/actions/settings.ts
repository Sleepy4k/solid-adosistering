"use server";

import type { MoistureStatus } from "@prisma/client";
import { ActivityAction, SyncStatus } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { updateRegionSettings, updateSprayerControl } from "../integrations/firebase";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import {
  parseInput,
  saveRegionSafetyTimeoutSchema,
  saveSafetyTimeoutSchema,
  saveThresholdSchema,
  setRegionAutomaticModeSchema,
} from "../validation";
import {
  displayThresholdDefaults,
  getRegionSafetyTimeoutMap,
  getRegionThresholdMap,
  getSafetyTimeoutDefault,
  normalizeSafetyTimeout,
  normalizePreference,
  SAFETY_TIMEOUT_KEY,
  logActivity,
  type RegionThreshold,
} from "../domain";

function requireThreshold(map: Map<string, RegionThreshold>, regionId: string) {
  const threshold = map.get(regionId);
  if (!threshold) throw new Error(`Threshold region ${regionId} tidak tersedia.`);
  return threshold;
}

/**
 * Reflect the Firebase mirror state on the relational region row. SQL stays
 * authoritative, so a failed RTDB push only flags the row for retry.
 *
 * A settings-only push must never mask an existing FAILED state: a failed
 * rename/provisioning leaves blocks orphaned under the old RTDB node, and
 * silently marking the region SYNCED would hide that.
 *
 * Returns whether the intended status was actually persisted. A `false` for
 * SYNCED means a sticky FAILED marker blocked the update (or the write
 * failed), so callers must report FAILED rather than claim success. Never
 * throws: sync bookkeeping must not turn a completed write into an error.
 */
async function persistRegionSyncStatus(regionId: string, status: SyncStatus): Promise<boolean> {
  try {
    if (status === SyncStatus.SYNCED) {
      const result = await prisma.region.updateMany({
        where: { id: regionId, firebaseSyncStatus: { not: SyncStatus.FAILED } },
        data: { firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
      });
      return result.count > 0;
    }

    await prisma.region.update({
      where: { id: regionId },
      data: { firebaseSyncStatus: SyncStatus.FAILED, firebaseSyncedAt: null },
    });
    return true;
  } catch (error) {
    console.error("[firebase] region sync status update failed", error);
    return false;
  }
}

/** Active sprayer totals per region, used by the settings screens. */
async function getActiveSprayerCountMap(regionIds: string[]) {
  const uniqueRegionIds = [...new Set(regionIds)];
  const counts = new Map<string, number>();
  if (uniqueRegionIds.length === 0) return counts;
  for (const regionId of uniqueRegionIds) counts.set(regionId, 0);

  const blocks = await prisma.block.findMany({
    where: { regionId: { in: uniqueRegionIds } },
    select: {
      regionId: true,
      _count: { select: { sprayers: { where: { isActive: true } } } },
    },
  });
  for (const block of blocks) {
    counts.set(block.regionId, (counts.get(block.regionId) ?? 0) + block._count.sprayers);
  }
  return counts;
}

/**
 * Per-region promise tails used to serialize automatic-mode toggles inside this
 * process. A toggle walks every sprayer and then mirrors SQL/Firebase; a second
 * toggle for the same region must not interleave with that walk, otherwise a
 * late compensation for a failed enable could switch sprayers back to MANUAL
 * after a newer enable already succeeded. Keys are region ids, so unrelated
 * regions never block one another.
 */
const automaticModeTails = new Map<string, Promise<void>>();

async function withAutomaticModeLock<T>(regionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = automaticModeTails.get(regionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  automaticModeTails.set(regionId, tail);

  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (automaticModeTails.get(regionId) === tail) automaticModeTails.delete(regionId);
  }
}

type RegionSettingsMirrorOverrides = {
  dryMaxPercent?: number;
  wetMinPercent?: number;
  automaticMode?: boolean;
  safetyTimeoutMin?: number;
  safetyTimeoutMax?: number;
};

/**
 * Push the current region settings to the Firebase mirror under the same
 * per-region lock used by automatic-mode toggles. Callers must not pass a
 * region snapshot captured before their SQL write: a toggle (or another
 * settings save) may have committed in between, and mirroring that stale
 * `automaticMode` would resurrect an outdated hardware state in RTDB.
 *
 * The fresh read is the source of truth: callers pass no overrides after a SQL
 * commit, so a newer row from another writer wins instead of being overwritten
 * by an earlier snapshot. `overrides` is only an escape hatch for a value that
 * has no relational home. The lock covers the read + push; callers run their
 * transaction before acquiring it, so a queued toggle cannot deadlock behind
 * SQL work.
 *
 * Throws when the Firebase write fails, letting callers persist
 * `SyncStatus.FAILED` in their existing catch blocks.
 */
async function mirrorCurrentRegionSettings(regionId: string, overrides: RegionSettingsMirrorOverrides = {}) {
  await withAutomaticModeLock(regionId, async () => {
    const settings = await prisma.region.findUnique({
      where: { id: regionId },
      select: {
        name: true,
        dryMaxPercent: true,
        wetMinPercent: true,
        automaticMode: true,
        safetyTimeoutMin: true,
        safetyTimeoutMax: true,
      },
    });
    if (!settings) throw new Error(`Region ${regionId} tidak ditemukan.`);

    await updateRegionSettings({
      regionName: settings.name,
      dryMaxPercent: overrides.dryMaxPercent ?? settings.dryMaxPercent,
      wetMinPercent: overrides.wetMinPercent ?? settings.wetMinPercent,
      automaticMode: overrides.automaticMode ?? settings.automaticMode,
      safetyTimeoutMin: overrides.safetyTimeoutMin ?? settings.safetyTimeoutMin,
      safetyTimeoutMax: overrides.safetyTimeoutMax ?? settings.safetyTimeoutMax,
    });
    await persistRegionSyncStatus(regionId, SyncStatus.SYNCED);
  });
}

type AutomaticModeSprayer = {
  id: string;
  hardwareId: string;
  blockName: string;
};

const MANUAL_OFF_MAX_ATTEMPTS = 3;

/**
 * Best-effort return to the safe hardware state. Each sprayer gets a bounded
 * number of immediate attempts (no backoff: this runs while the per-region lock
 * is held and the request is already failing). Returns the internal sprayer ids
 * that still failed so callers can escalate; those ids, like hardware ids, must
 * stay server-side and never reach the client.
 */
async function forceManualOff(regionName: string, sprayers: AutomaticModeSprayer[]): Promise<string[]> {
  const failedSprayerIds: string[] = [];
  for (const sprayer of sprayers) {
    for (let attempt = 1; attempt <= MANUAL_OFF_MAX_ATTEMPTS; attempt += 1) {
      try {
        await updateSprayerControl({
          regionName,
          blockName: sprayer.blockName,
          hardwareId: sprayer.hardwareId,
          mode: "MANUAL",
          relay: "OFF",
        });
        break;
      } catch (error) {
        if (attempt === MANUAL_OFF_MAX_ATTEMPTS) {
          console.error(
            `[region] failed to restore MANUAL/OFF for sprayer ${sprayer.id} after ${MANUAL_OFF_MAX_ATTEMPTS} attempts`,
            error,
          );
          failedSprayerIds.push(sprayer.id);
        }
      }
    }
  }
  return failedSprayerIds;
}

/**
 * Client-safe escalation when a failed toggle could not confirm every sprayer
 * is back in MANUAL/OFF. Device details stay in the server logs; operators are
 * told to verify the physical state before retrying.
 */
function compensationUnverifiedResponse() {
  return new Response(
    "Perintah mode otomatis gagal dan sebagian perangkat mungkin belum kembali ke MANUAL/OFF. Verifikasi kondisi perangkat sebelum mencoba lagi.",
    { status: 503 },
  );
}

async function setActiveSprayersMode(regionName: string, sprayers: AutomaticModeSprayer[], mode: "AUTO" | "MANUAL") {
  const failedSprayerIds: string[] = [];
  for (const sprayer of sprayers) {
    try {
      await updateSprayerControl({
        regionName,
        blockName: sprayer.blockName,
        hardwareId: sprayer.hardwareId,
        mode,
        relay: "OFF",
      });
    } catch (error) {
      console.error(`[region] failed to set ${mode}/OFF for sprayer ${sprayer.id}`, error);
      failedSprayerIds.push(sprayer.id);
    }
  }
  return failedSprayerIds;
}

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
    const sprayerCountMap = await getActiveSprayerCountMap(regionIds);

    return {
      role: "ADMIN" as const,
      regions: assignments.map((a) => ({
        id: a.region.id,
        name: a.region.name,
        blockCount: a.region._count.blocks,
        automaticMode: a.region.automaticMode,
        sprayerCount: sprayerCountMap.get(a.region.id) ?? 0,
        threshold: requireThreshold(thresholdMap, a.region.id),
        safetyTimeout: safetyTimeoutMap.get(a.region.id) ?? safetyTimeout,
      })),
    };
  }

  const assignments = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    include: { region: { include: { _count: { select: { blocks: true } } } } },
  });
  const regionIds = assignments.map((a) => a.regionId);
  const thresholdMap = await getRegionThresholdMap(session.id, regionIds);
  const safetyTimeoutMap = await getRegionSafetyTimeoutMap(regionIds, safetyTimeout);
  const sprayerCountMap = await getActiveSprayerCountMap(regionIds);

  return {
    role: "USER" as const,
    regions: assignments.map((a) => ({
      id: a.region.id,
      name: a.region.name,
      blockCount: a.region._count.blocks,
      automaticMode: a.region.automaticMode,
      sprayerCount: sprayerCountMap.get(a.region.id) ?? 0,
      threshold: requireThreshold(thresholdMap, a.region.id),
      safetyTimeout: safetyTimeoutMap.get(a.region.id) ?? safetyTimeout,
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
  const data = parseInput(saveThresholdSchema, input);
  if (data.dryMaxPercent >= data.wetMinPercent) {
    throw new Response("Batas kering harus lebih kecil dari batas basah.", { status: 400 });
  }
  const displayThresholds = displayThresholdDefaults(data);
  if (displayThresholds.displayDryMaxPercent >= displayThresholds.displayWetMinPercent) {
    throw new Response("Batas tampilan kering harus lebih kecil dari batas tampilan basah.", { status: 400 });
  }
  const session = await getSession();
  if (!session) throw redirect("/login");

  if (session.role === "USER") {
    const assignment = await prisma.userRegionAssignment.findUnique({
      where: { userId_regionId: { userId: session.id, regionId: data.regionId } },
      select: { regionId: true },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses user.", { status: 403 });
  } else if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: data.regionId } },
      select: { regionId: true },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
  } else {
    throw new Response("Pengaturan region hanya tersedia untuk Admin atau User.", { status: 403 });
  }

  const landPreference = normalizePreference(data.landPreference);
  await prisma.$transaction([
    prisma.region.update({
      where: { id: data.regionId },
      data: {
        dryMaxPercent: data.dryMaxPercent,
        wetMinPercent: data.wetMinPercent,
        updatedById: session.id,
      },
    }),
    prisma.indicatorThreshold.upsert({
      where: { userId_regionId: { userId: session.id, regionId: data.regionId } },
      create: {
        userId: session.id,
        regionId: data.regionId,
        ...displayThresholds,
        landPreference,
      },
      update: {
        ...displayThresholds,
        landPreference,
      },
    }),
  ]);

  try {
    // Re-read under the automatic-mode lock instead of reusing a snapshot taken
    // before the SQL commit, so a concurrent toggle is not overwritten in RTDB.
    await mirrorCurrentRegionSettings(data.regionId);
  } catch (error) {
    console.error("[firebase] updateRegionSettings", error);
    await persistRegionSyncStatus(data.regionId, SyncStatus.FAILED);
  }

  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.UPDATE,
    entityType: "IndicatorThreshold",
    entityId: data.regionId,
    metadata: {
      dryMaxPercent: data.dryMaxPercent,
      wetMinPercent: data.wetMinPercent,
      ...displayThresholds,
      landPreference,
    },
  }).catch((error: unknown) => {
    // Thresholds and the RTDB mirror already committed; a failed audit insert
    // must not turn a successful save into a 500 that invites a repeat.
    console.error("[activity] saveThreshold audit failed:", error);
  });
  return { ok: true };
}

export async function saveSafetyTimeout(input: { min: number; max: number }) {
  const data = parseInput(saveSafetyTimeoutSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role !== "SUPERADMIN") throw new Response("Forbidden", { status: 403 });
  const { min, max } = normalizeSafetyTimeout(data);

  await prisma.systemSetting.upsert({
    where: { key: SAFETY_TIMEOUT_KEY },
    create: { key: SAFETY_TIMEOUT_KEY, value: { min, max } },
    update: { value: { min, max } },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: SAFETY_TIMEOUT_KEY,
    metadata: { min, max },
  }).catch((error: unknown) => {
    // The setting is already persisted; audit failure is logged, not surfaced.
    console.error("[activity] saveSafetyTimeout audit failed:", error);
  });
  return { ok: true };
}

export async function saveRegionSafetyTimeout(input: { regionId: string; min: number; max: number }) {
  const data = parseInput(saveRegionSafetyTimeoutSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") throw new Response("Pengaturan region hanya tersedia untuk Admin.", { status: 403 });

  const { min, max } = normalizeSafetyTimeout(data);

  if (session.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: session.id, regionId: data.regionId } },
      select: { regionId: true },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
  } else {
    const region = await prisma.region.findUnique({ where: { id: data.regionId }, select: { id: true } });
    if (!region) throw new Response("Region tidak ditemukan.", { status: 404 });
  }

  await prisma.region.update({
    where: { id: data.regionId },
    data: { safetyTimeoutMin: min, safetyTimeoutMax: max, updatedById: session.id },
  });

  try {
    // Mirror the freshly committed row under the automatic-mode lock rather
    // than replaying `automaticMode` from the pre-update snapshot.
    await mirrorCurrentRegionSettings(data.regionId);
  } catch (error) {
    console.error("[firebase] updateRegionSettings", error);
    await persistRegionSyncStatus(data.regionId, SyncStatus.FAILED);
  }

  await logActivity({
    actorId: session.id,
    regionId: data.regionId,
    action: ActivityAction.UPDATE,
    entityType: "RegionSafetyTimeout",
    entityId: data.regionId,
    metadata: { min, max },
  }).catch((error: unknown) => {
    // Region row and RTDB mirror already committed; keep the 200 response.
    console.error("[activity] saveRegionSafetyTimeout audit failed:", error);
  });

  return { ok: true };
}

/**
 * Re-validate that the signed-in account still exists, is active, and may
 * control the region. Called once as a cheap pre-check and again after the
 * per-region lock is acquired: an admin whose grant (or account) was revoked
 * while the toggle sat in the queue must not execute it later.
 */
async function assertAutomaticModeAccess(userId: string, regionId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!actor || !actor.isActive || actor.deletedAt || actor.role === "USER") {
    throw new Response("Pengaturan mode otomatis hanya tersedia untuk Admin.", { status: 403 });
  }

  if (actor.role === "ADMIN") {
    const assignment = await prisma.adminRegionAssignment.findUnique({
      where: { adminId_regionId: { adminId: userId, regionId } },
      select: { regionId: true },
    });
    if (!assignment) throw new Response("Region tidak berada di hak akses admin.", { status: 403 });
  }
}

/**
 * Region-level automatic mode is a hardware control, not just a configuration
 * flag: enabling switches every active sprayer to AUTO/OFF, disabling returns
 * them to MANUAL/OFF. The relational `Region` row is written only after every
 * device acknowledged, then mirrored to Firebase `region_settings`.
 */
export async function setRegionAutomaticMode(input: { regionId: string; enabled: boolean }) {
  const data = parseInput(setRegionAutomaticModeSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");

  // Fast pre-check before queueing: deny obvious cases without occupying the
  // per-region tail. The authoritative re-check happens once the lock is held.
  await assertAutomaticModeAccess(session.id, data.regionId);

  return withAutomaticModeLock(data.regionId, async () => {
    // The lock can be queued behind another toggle or a settings mirror; the
    // grant may have been revoked in the meantime, so re-check before acting.
    await assertAutomaticModeAccess(session.id, data.regionId);

    // Re-read after the lock is held: a queued toggle must act on the sprayer
    // set and thresholds that are current at execution time, not at enqueue.
    const region = await prisma.region.findUnique({
      where: { id: data.regionId },
      select: {
        name: true,
        dryMaxPercent: true,
        wetMinPercent: true,
        safetyTimeoutMin: true,
        safetyTimeoutMax: true,
        // Read the sticky marker under the lock so an automatic-mode write can
        // avoid resurrecting a region whose rename/provisioning never landed.
        firebaseSyncStatus: true,
        blocks: {
          select: {
            name: true,
            sprayers: { where: { isActive: true }, select: { id: true, hardwareId: true } },
          },
        },
      },
    });
    if (!region) throw new Response("Region tidak ditemukan.", { status: 404 });

    const sprayers: AutomaticModeSprayer[] = region.blocks.flatMap((block) =>
      block.sprayers.map((sprayer) => ({
        id: sprayer.id,
        hardwareId: sprayer.hardwareId,
        blockName: block.name,
      })),
    );

    if (data.enabled && sprayers.length === 0) {
      throw new Response("Region belum memiliki sprayer aktif.", { status: 400 });
    }

    const failedSprayerIds = await setActiveSprayersMode(region.name, sprayers, data.enabled ? "AUTO" : "MANUAL");

    if (failedSprayerIds.length > 0) {
      if (data.enabled) {
        // Enabling is the risky direction: some sprayers may already be AUTO,
        // so put the whole region back into the safe MANUAL/OFF state before
        // failing. Never advance SQL or Firebase when hardware did not fully
        // ack, and escalate when compensation itself is incomplete.
        const compensationFailures = await forceManualOff(region.name, sprayers);
        if (compensationFailures.length > 0) {
          console.error(
            `[region] automatic mode enable failed and ${compensationFailures.length} sprayer(s) may remain out of MANUAL/OFF`,
            { regionId: data.regionId },
          );
          throw compensationUnverifiedResponse();
        }
      } else {
        // SQL stays at `true`; only the server needs the failure scope.
        console.error(`[region] automatic mode disable failed for ${failedSprayerIds.length} sprayer(s)`, {
          regionId: data.regionId,
        });
      }
      throw new Response("Perintah mode otomatis region gagal dikirim ke perangkat.", { status: 502 });
    }

    // A pre-existing FAILED marker means a rename/provisioning is still
    // unrepaired: the hardware toggle must not overwrite it with PENDING and
    // thereby let the later SYNCED write erase evidence of the orphaned RTDB
    // node. Automatic-mode columns are still updated in that case.
    const hasStickySyncFailure = region.firebaseSyncStatus === SyncStatus.FAILED;

    try {
      await prisma.region.update({
        where: { id: data.regionId },
        data: {
          automaticMode: data.enabled,
          updatedById: session.id,
          ...(hasStickySyncFailure ? {} : { firebaseSyncStatus: SyncStatus.PENDING, firebaseSyncedAt: null }),
        },
      });
    } catch (error) {
      // Hardware already moved but SQL is behind. Return the fleet to the safe
      // state so the physical devices never run ahead of the recorded flag.
      console.error("[region] automatic mode SQL update failed", error);
      const compensationFailures = await forceManualOff(region.name, sprayers);
      if (compensationFailures.length > 0) {
        console.error(
          `[region] automatic mode SQL update failed and ${compensationFailures.length} sprayer(s) may remain out of MANUAL/OFF`,
          { regionId: data.regionId },
        );
        throw compensationUnverifiedResponse();
      }
      throw new Response("Gagal menyimpan status mode otomatis region.", { status: 500 });
    }

    let syncStatus: "SYNCED" | "FAILED" = "SYNCED";
    try {
      await updateRegionSettings({
        regionName: region.name,
        dryMaxPercent: region.dryMaxPercent,
        wetMinPercent: region.wetMinPercent,
        automaticMode: data.enabled,
        safetyTimeoutMin: region.safetyTimeoutMin,
        safetyTimeoutMax: region.safetyTimeoutMax,
      });
      // Never write SYNCED directly: a sticky FAILED marker must survive a
      // successful settings mirror, otherwise an unrepaired rename looks clean.
      if (!(await persistRegionSyncStatus(data.regionId, SyncStatus.SYNCED))) {
        syncStatus = "FAILED";
      }
    } catch (error) {
      // The hardware command and SQL write already succeeded; a failed mirror
      // is a retryable sync problem, not a failed control command.
      console.error("[firebase] setRegionAutomaticMode mirror failed", error);
      syncStatus = "FAILED";
      await persistRegionSyncStatus(data.regionId, SyncStatus.FAILED);
    }

    await logActivity({
      actorId: session.id,
      regionId: data.regionId,
      action: ActivityAction.UPDATE,
      entityType: "RegionAutomaticMode",
      entityId: data.regionId,
      metadata: { enabled: data.enabled, sprayerCount: sprayers.length },
    }).catch((error: unknown) => {
      // Hardware and SQL already committed; a failed audit insert must not turn
      // a successful toggle into a 500. Same pattern as `regions.ts`.
      console.error("[activity] setRegionAutomaticMode audit failed:", error);
    });

    return { ok: true as const, automaticMode: data.enabled, sprayerCount: sprayers.length, syncStatus };
  });
}
