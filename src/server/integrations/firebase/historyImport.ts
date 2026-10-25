import type { Prisma } from "@prisma/client";
import { firebaseSprayerPath } from "~/lib/shared/irrigation";
import { prisma } from "../../db/prisma";
import { firebaseAdminDb } from "./admin";
import { stableSourceKey } from "./convert";
import { normalizeHistoryEntry, recentHistoryDateKeys, type NormalizedHistoryEntry } from "./historyNormalize";

/**
 * Firebase `history/{DDMMYYYY}/{pushId}` -> website database.
 *
 * Firebase stays the source of truth; `irrigation_event` and `sensor_reading`
 * are a backup and a fast, indexed read model. Imports are idempotent
 * (`firebase_event_id` / `source_key` are unique) and bulk: one read per date
 * node and a constant number of statements per batch instead of several
 * round-trips per entry.
 */

export type HistorySprayerTarget = {
  id: string;
  regionName: string;
  blockName: string;
  hardwareId: string;
};

export type HistoryImportScope = "all" | { dateKeys: string[] };

export type HistoryImportResult = { entries: number; created: number; updated: number };

type RawHistoryEntry = Parameters<typeof normalizeHistoryEntry>[0];

const MANUAL_MATCH_MS = 5 * 60 * 1000;
const ID_CHUNK = 500;
const WRITE_CHUNK = 200;
const UPDATE_PARALLELISM = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

type ParsedEntry = {
  firebaseEventId: string;
  dateKey: string;
  value: NormalizedHistoryEntry;
};

async function readHistory(target: HistorySprayerTarget, scope: HistoryImportScope) {
  const db = firebaseAdminDb();
  const base = `${firebaseSprayerPath(target.regionName, target.blockName, target.hardwareId)}/history`;

  if (scope === "all") {
    const snapshot = await db.ref(base).get();
    return snapshot.exists() ? (snapshot.val() as Record<string, unknown>) : {};
  }

  const nodes: Record<string, unknown> = {};
  await Promise.all(
    scope.dateKeys.map(async (dateKey) => {
      // Date keys are generated here, never taken from input; the guard keeps
      // that true if a caller ever changes.
      if (!/^\d{8}$/.test(dateKey)) return;
      const snapshot = await db.ref(`${base}/${dateKey}`).get();
      if (snapshot.exists()) nodes[dateKey] = snapshot.val();
    }),
  );
  return nodes;
}

function parseEntries(target: HistorySprayerTarget, raw: Record<string, unknown>): ParsedEntry[] {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const parsed: ParsedEntry[] = [];

  for (const [dateKey, events] of Object.entries(raw)) {
    if (!events || typeof events !== "object") continue;
    for (const [eventId, entry] of Object.entries(events as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const value = normalizeHistoryEntry(entry as RawHistoryEntry, nowSeconds);
      if (!value) continue;
      parsed.push({
        firebaseEventId: `${target.regionName}/${target.blockName}/${target.hardwareId}/${dateKey}/${eventId}`,
        dateKey,
        value,
      });
    }
  }

  return parsed;
}

const sameVolume = (a: Prisma.Decimal | null, b: number | null) =>
  a === null || b === null ? a === null && b === null : Math.abs(Number(a) - b) < 0.005;

const sameTime = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());

async function runImport(target: HistorySprayerTarget, scope: HistoryImportScope): Promise<HistoryImportResult> {
  const raw = await readHistory(target, scope);
  const entries = parseEntries(target, raw);
  const result: HistoryImportResult = { entries: entries.length, created: 0, updated: 0 };
  if (entries.length === 0) return result;

  const existingRows = (
    await Promise.all(
      chunk(
        entries.map((entry) => entry.firebaseEventId),
        ID_CHUNK,
      ).map((ids) =>
        prisma.irrigationEvent.findMany({
          where: { firebaseEventId: { in: ids } },
          select: {
            id: true,
            firebaseEventId: true,
            actorId: true,
            mode: true,
            relay: true,
            startedAt: true,
            endedAt: true,
            durationSeconds: true,
            totalVolumeLiter: true,
          },
        }),
      ),
    )
  ).flat();
  const existing = new Map(existingRows.map((row) => [row.firebaseEventId, row]));

  // Repair rows stored by earlier imports whose values were malformed. Rows
  // that a person created from the website only ever gain missing end data.
  const repairs: Array<() => Promise<unknown>> = [];
  for (const entry of entries) {
    const row = existing.get(entry.firebaseEventId);
    if (!row) continue;
    const next = entry.value;
    const fromWebsite = row.actorId !== null;
    const data: Prisma.IrrigationEventUpdateInput = {};

    if (!fromWebsite && !sameTime(row.startedAt, next.startedAt)) data.startedAt = next.startedAt;
    if (!sameTime(row.endedAt, next.endedAt) && (!fromWebsite || row.endedAt === null)) data.endedAt = next.endedAt;
    if (row.durationSeconds !== next.durationSeconds && (!fromWebsite || row.durationSeconds === null)) {
      data.durationSeconds = next.durationSeconds;
    }
    if (!sameVolume(row.totalVolumeLiter, next.totalVolumeLiter)) data.totalVolumeLiter = next.totalVolumeLiter;
    if (!fromWebsite && row.mode !== next.mode) data.mode = next.mode;
    if (!fromWebsite && row.relay !== next.relay) data.relay = next.relay;

    if (Object.keys(data).length > 0) {
      repairs.push(() => prisma.irrigationEvent.update({ where: { id: row.id }, data }));
    }
  }
  for (const batch of chunk(repairs, UPDATE_PARALLELISM)) await Promise.all(batch.map((run) => run()));
  result.updated += repairs.length;

  const fresh = entries
    .filter((entry) => !existing.has(entry.firebaseEventId))
    .sort((a, b) => a.value.startedAt.getTime() - b.value.startedAt.getTime());

  if (fresh.length > 0) {
    // A pump command issued from the website is recorded before the device
    // writes its history node. Pair each Firebase session with the closest
    // unmatched website event within five minutes instead of duplicating it.
    const first = fresh[0]!.value.startedAt.getTime();
    const last = fresh[fresh.length - 1]!.value.startedAt.getTime();
    const candidates = await prisma.irrigationEvent.findMany({
      where: {
        sprayerId: target.id,
        firebaseEventId: null,
        startedAt: { gte: new Date(first - MANUAL_MATCH_MS), lte: new Date(last + MANUAL_MATCH_MS) },
      },
      select: { id: true, startedAt: true, endedAt: true, durationSeconds: true },
    });
    const unclaimed = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const toCreate: ParsedEntry[] = [];
    const claims: Array<() => Promise<unknown>> = [];

    for (const entry of fresh) {
      const startedMs = entry.value.startedAt.getTime();
      let best: (typeof candidates)[number] | undefined;
      let bestDelta = MANUAL_MATCH_MS + 1;
      for (const candidate of unclaimed.values()) {
        const delta = Math.abs(candidate.startedAt.getTime() - startedMs);
        if (delta < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }

      if (!best || bestDelta > MANUAL_MATCH_MS) {
        toCreate.push(entry);
        continue;
      }

      unclaimed.delete(best.id);
      const match = best;
      claims.push(() =>
        prisma.irrigationEvent.update({
          where: { id: match.id },
          data: {
            firebaseEventId: entry.firebaseEventId,
            firebaseDateKey: entry.dateKey,
            ...(entry.value.endedAt && !match.endedAt ? { endedAt: entry.value.endedAt } : {}),
            ...(entry.value.durationSeconds !== null && match.durationSeconds === null
              ? { durationSeconds: entry.value.durationSeconds }
              : {}),
            ...(entry.value.totalVolumeLiter !== null ? { totalVolumeLiter: entry.value.totalVolumeLiter } : {}),
          },
        }),
      );
    }

    for (const batch of chunk(claims, UPDATE_PARALLELISM)) await Promise.all(batch.map((run) => run()));
    result.updated += claims.length;

    for (const batch of chunk(toCreate, WRITE_CHUNK)) {
      const created = await prisma.irrigationEvent.createMany({
        skipDuplicates: true,
        data: batch.map((entry) => ({
          sprayerId: target.id,
          actorId: null,
          mode: entry.value.mode,
          relay: entry.value.relay,
          reason: "Imported from Firebase RTDB history",
          durationSeconds: entry.value.durationSeconds,
          totalVolumeLiter: entry.value.totalVolumeLiter,
          firebaseEventId: entry.firebaseEventId,
          firebaseDateKey: entry.dateKey,
          startedAt: entry.value.startedAt,
          endedAt: entry.value.endedAt,
        })),
      });
      result.created += created.count;
    }
  }

  // Each session also carries a sensor sample; the history page resolves the
  // soil moisture of an event from these rows.
  if (scope === "all") {
    // The one-time backfill also repairs sensor rows stored by earlier imports
    // (insert-only below would leave their old values in place).
    for (const batch of chunk(entries, UPDATE_PARALLELISM)) {
      await Promise.all(
        batch.map((entry) => {
          const values = {
            moisturePercent: entry.value.moisturePercent,
            flowLmin: entry.value.flowLmin,
            totalVolumeLiter: entry.value.totalVolumeLiter,
            moistureStatus: entry.value.moistureStatus,
            pumpStatus: entry.value.relay,
            recordedAt: entry.value.recordedAt,
          };
          const sourceKey = stableSourceKey("history", entry.firebaseEventId);
          return prisma.sensorReading.upsert({
            where: { sprayerId_sourceKey: { sprayerId: target.id, sourceKey } },
            update: values,
            create: { sprayerId: target.id, sourceKey, ...values },
          });
        }),
      );
    }
    return result;
  }

  for (const batch of chunk(entries, WRITE_CHUNK)) {
    await prisma.sensorReading.createMany({
      skipDuplicates: true,
      data: batch.map((entry) => ({
        sprayerId: target.id,
        sourceKey: stableSourceKey("history", entry.firebaseEventId),
        moisturePercent: entry.value.moisturePercent,
        flowLmin: entry.value.flowLmin,
        totalVolumeLiter: entry.value.totalVolumeLiter,
        moistureStatus: entry.value.moistureStatus,
        pumpStatus: entry.value.relay,
        recordedAt: entry.value.recordedAt,
      })),
    });
  }

  return result;
}

const inFlight = new Map<string, Promise<HistoryImportResult>>();

/**
 * Import Firebase history for one sprayer. Concurrent calls for the same
 * sprayer and scope share one run, so a page load and the background refresh
 * never double-read the node.
 */
export function importSprayerHistory(
  target: HistorySprayerTarget,
  scope: HistoryImportScope,
): Promise<HistoryImportResult> {
  const key = `${target.id}:${scope === "all" ? "all" : scope.dateKeys.join(",")}`;
  const running = inFlight.get(key);
  if (running) return running;

  const job = runImport(target, scope).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, job);
  return job;
}
