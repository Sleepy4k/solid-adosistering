import "server-only";

import { formatJakartaDateTime } from "~/lib/shared/datetime";
import type { HistoryItem } from "~/server/domain/historyData";

/**
 * Canonical column order shared by every export format. The headers match the
 * legacy CSV exactly so switching format never changes the visible field set.
 */
export const HISTORY_EXPORT_HEADERS = [
  "Region",
  "Blok",
  "Sprayer",
  "Hardware ID",
  "Waktu Mulai (WIB)",
  "Waktu Selesai (WIB)",
  "Durasi (detik)",
  "Jenis Irigasi",
  "Status Relay",
  "Status Event",
  "Volume Air (L)",
  "Debit Rata-rata (L/menit)",
  "Kelembaban (%)",
  "Kondisi Tanah",
  "Operator",
] as const;

export type HistoryExportValue = string | number | null;

/** One canonical export row, aligned with `HISTORY_EXPORT_HEADERS`. */
export type HistoryExportRow = HistoryExportValue[];

/** All formats accepted by the export endpoint. */
export type HistoryExportFormat = "csv" | "xlsx" | "pdf";

/**
 * Tabular formats buffer the whole file in memory, so they get the higher cap.
 * PDF is capped lower by `maxRowsFor` because `pdf-lib` serialisation is
 * synchronous and blocks the event loop proportionally to the row count.
 */
export const EXPORT_MAX_ROWS = 5000;
export const PDF_MAX_ROWS = 2000;

/** Row cap for the requested format; CSV and XLSX share the higher tabular cap. */
export function maxRowsFor(format: HistoryExportFormat): number {
  return format === "pdf" ? PDF_MAX_ROWS : EXPORT_MAX_ROWS;
}

/**
 * Spreadsheet apps execute cells starting with `=`, `+`, `-`, `@` or their
 * full-width variants (U+FF1D, U+FF0B, U+FF0D, U+FF20). Leading padding is
 * transparent to that decision, so every Unicode control/format/unassigned
 * (`\p{C}`) and separator (`\p{Z}`) character is skipped before testing the
 * first significant character. That covers C1 controls, bidi marks, BOM,
 * zero-width characters and NBSP, not just the ASCII/`\s` subset.
 * Prefixing a single quote keeps the value as text (CSV injection defence).
 * The single `*` keeps the match linear-time (no nested quantifiers).
 */
const SPREADSHEET_FORMULA_PREFIX = /^[\p{C}\p{Z}]*[=+\-@＝＋－＠]/u;

/**
 * Plain decimal numbers (including negative values) are never formulas and
 * must keep their exact representation: prefixing `-12.50` with an apostrophe
 * would turn a numeric cell into text and break spreadsheet aggregation. A
 * value with any prefix (for example a zero-width space before `-12`) does not
 * match and still goes through the formula check below.
 */
const PLAIN_DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function neutralizeSpreadsheetFormula(value: string): string {
  if (PLAIN_DECIMAL.test(value)) return value;
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function formatDecimal(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function averageFlowLmin(item: HistoryItem): string | null {
  if (item.totalVolumeLiter === null || item.durationSeconds === null || item.durationSeconds <= 0) return null;
  return formatDecimal(item.totalVolumeLiter / (item.durationSeconds / 60));
}

function moistureLabel(status: string | null): string | null {
  if (status === null) return null;
  if (status === "KERING") return "Kering";
  if (status === "BASAH") return "Basah";
  return "Lembab";
}

/**
 * Project one enriched history item onto the canonical export columns.
 * Formats only render these values; they never reach back into Prisma types.
 */
export function toHistoryExportRow(item: HistoryItem): HistoryExportValue[] {
  const mode = item.mode === "AUTO" ? "Otomatis" : "Manual";
  const relay = item.relay === "ON" ? "Nyala" : "Mati";
  const eventStatus = item.relay === "ON" && !item.endedAt ? "Irigasi Aktif" : "Irigasi Selesai";

  return [
    item.block.region.name,
    item.block.name,
    item.sprayer.displayName,
    item.sprayer.hardwareId,
    formatJakartaDateTime(item.startedAt),
    item.endedAt ? formatJakartaDateTime(item.endedAt) : null,
    item.durationSeconds,
    mode,
    relay,
    eventStatus,
    formatDecimal(item.totalVolumeLiter),
    averageFlowLmin(item),
    item.sensor ? formatDecimal(item.sensor.moisturePercent) : null,
    item.sensor ? moistureLabel(item.sensor.moistureStatus) : null,
    item.actor?.name ?? null,
  ];
}

/** Plain display text for tabular formats that have no null cell type. */
export function displayExportValue(value: HistoryExportValue): string {
  return value === null ? "" : String(value);
}
