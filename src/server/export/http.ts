import "server-only";

import { appOrigin } from "~/server/config";
import { HEAVY_EXPORT_BUSY_MESSAGE } from "./heavyExport";
import { neutralizeSpreadsheetFormula } from "./historyRows";
import type { ExportColumn, ExportFormat, ExportRow, ExportValue } from "./table";

/** Response plumbing shared by the export endpoints. */

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const satisfies readonly ExportFormat[];

export const EXPORT_FORMAT_META: Record<ExportFormat, { readonly extension: string; readonly contentType: string }> = {
  csv: { extension: "csv", contentType: "text/csv; charset=utf-8" },
  xlsx: {
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { extension: "pdf", contentType: "application/pdf" },
};

export function textResponse(body: string, status: number, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function heavyExportBusyResponse(): Response {
  return textResponse(HEAVY_EXPORT_BUSY_MESSAGE, 503, { "Retry-After": "5" });
}

/** Client went away (or aborted the fetch): stop work without a response body. */
export function exportAbortedResponse(): Response {
  return new Response(null, {
    status: 499,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * GET exports are still CSRF-sensitive because the session cookie rides along.
 * Reject explicit cross-site fetches and mismatched `Origin`/`Referer`. A
 * request with neither header (curl, bookmark, address bar) is allowed: the
 * session check in the handler still gates the data and the UI download link
 * must keep working without a custom header.
 */
export function isCrossSiteRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (origin !== null) return origin !== appOrigin;

  const referer = request.headers.get("referer");
  if (referer === null) return false;

  try {
    return new URL(referer).origin !== appOrigin;
  } catch {
    // A malformed Referer is treated as hostile rather than as a missing header.
    return true;
  }
}

function csvCell(value: ExportValue): string {
  if (value === null) return "";
  const text = String(value);
  if (text === "") return "";

  return `"${neutralizeSpreadsheetFormula(text).replace(/"/g, '""')}"`;
}

/** UTF-8 CSV with a BOM (so Excel detects the encoding) and CRLF line endings. */
export function buildCsv(headers: readonly string[], rows: readonly ExportRow[]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvHeaders(columns: readonly ExportColumn[]): string[] {
  return columns.map((column) => column.header);
}
