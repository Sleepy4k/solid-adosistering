import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { displayMoistureStatus, getRegionThresholdMap } from "./thresholds";

/**
 * Single source of truth for the irrigation history projection.
 * The list action and the CSV export must return the same fields, otherwise
 * the exported file can drift from what the UI shows.
 */
export const historyEventSelect = {
  id: true,
  mode: true,
  relay: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  totalVolumeLiter: true,
  sprayer: {
    select: {
      id: true,
      displayName: true,
      hardwareId: true,
      block: {
        select: {
          id: true,
          name: true,
          region: { select: { id: true, name: true, volumeDivider: true } },
        },
      },
    },
  },
  actor: { select: { id: true, name: true } },
} as const satisfies Prisma.IrrigationEventSelect;

export type HistoryEventRow = Prisma.IrrigationEventGetPayload<{ select: typeof historyEventSelect }>;

/** Enriched history row rendered by the list page and flattened into CSV. */
export type HistoryItem = {
  id: string;
  mode: HistoryEventRow["mode"];
  relay: HistoryEventRow["relay"];
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  totalVolumeLiter: number | null;
  block: {
    id: string;
    name: string;
    region: { id: string; name: string };
  };
  sprayer: {
    id: string;
    displayName: string;
    hardwareId: string;
  };
  actor: { id: string; name: string } | null;
  sensor: {
    moisturePercent: number | null;
    flowLmin: number;
    moistureStatus: string | null;
  } | null;
};

type EventSensorReading = {
  eventId: string;
  moisturePercent: string | number | null;
  flowLmin: string | number | null;
  totalVolumeLiter: string | number | null;
  moistureStatus: string | null;
};

/**
 * Bound the `IN (...)` list so very large exports never send thousands of
 * placeholders in a single statement.
 */
const SENSOR_BATCH_SIZE = 500;

/**
 * Nearest sensor reading at or before each event's `started_at`, using one
 * correlated query per chunk instead of one query per event (the old N+1).
 * `INNER JOIN` is intentional: when an event has no preceding reading the row
 * must disappear so the caller can project `sensor: null` instead of inventing
 * a default moisture status.
 */
async function fetchNearestReadings(eventIds: string[]): Promise<EventSensorReading[]> {
  const readings: EventSensorReading[] = [];

  for (let start = 0; start < eventIds.length; start += SENSOR_BATCH_SIZE) {
    const chunk = eventIds.slice(start, start + SENSOR_BATCH_SIZE);
    if (chunk.length === 0) continue;

    const rows = await prisma.$queryRaw<EventSensorReading[]>`
      SELECT e.id AS eventId,
             sr.moisture_percent AS moisturePercent,
             sr.flow_lmin AS flowLmin,
             sr.total_volume_liter AS totalVolumeLiter,
             sr.moisture_status AS moistureStatus
      FROM irrigation_event e
      INNER JOIN sensor_reading sr ON sr.id = (
        SELECT sr2.id
        FROM sensor_reading sr2
        WHERE sr2.sprayer_id = e.sprayer_id
          AND sr2.recorded_at <= e.started_at
        ORDER BY sr2.recorded_at DESC, sr2.id DESC
        LIMIT 1
      )
      WHERE e.id IN (${Prisma.join(chunk)})
    `;
    readings.push(...rows);
  }

  return readings;
}

/**
 * Enrich selected events with the same derived values the history UI shows:
 * nearest sensor reading, region `volumeDivider` scaling, per-user moisture
 * status and the duration fallback for events missing `durationSeconds`.
 */
export async function enrichIrrigationEvents(events: HistoryEventRow[], userId: string): Promise<HistoryItem[]> {
  if (events.length === 0) return [];

  const regionIds = [...new Set(events.map((event) => event.sprayer.block.region.id))];
  const [thresholdMap, readingRows] = await Promise.all([
    getRegionThresholdMap(userId, regionIds),
    fetchNearestReadings(events.map((event) => event.id)),
  ]);
  const readingsByEvent = new Map(readingRows.map((row) => [row.eventId, row]));

  return events.map((event) => {
    const reading = readingsByEvent.get(event.id);
    const moisturePercent = reading?.moisturePercent == null ? null : Number(reading.moisturePercent);
    const block = event.sprayer.block;
    const threshold = thresholdMap.get(block.region.id) ?? null;
    const moistureStatus =
      reading && moisturePercent !== null
        ? displayMoistureStatus(moisturePercent, threshold)
        : (reading?.moistureStatus ?? null);
    const dividerCandidate = Number(block.region.volumeDivider ?? 1);
    // A zero/negative/NaN divider would yield Infinity or flip the sign of every
    // derived volume, so fall back to the identity divider.
    const volumeDivider = Number.isFinite(dividerCandidate) && dividerCandidate > 0 ? dividerCandidate : 1;

    const rawVolume =
      event.totalVolumeLiter === null
        ? reading?.totalVolumeLiter == null
          ? null
          : Number(reading.totalVolumeLiter)
        : Number(event.totalVolumeLiter);

    const durationSeconds =
      event.durationSeconds ??
      (event.endedAt ? Math.round((event.endedAt.getTime() - event.startedAt.getTime()) / 1000) : null);

    return {
      id: event.id,
      mode: event.mode,
      relay: event.relay,
      startedAt: event.startedAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
      durationSeconds,
      totalVolumeLiter: rawVolume === null ? null : rawVolume / volumeDivider,
      block: {
        id: block.id,
        name: block.name,
        region: { id: block.region.id, name: block.region.name },
      },
      sprayer: {
        id: event.sprayer.id,
        displayName: event.sprayer.displayName,
        hardwareId: event.sprayer.hardwareId,
      },
      actor: event.actor,
      sensor: reading
        ? {
            moisturePercent,
            flowLmin: Number(reading.flowLmin) / volumeDivider,
            moistureStatus,
          }
        : null,
    };
  });
}
