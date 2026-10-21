import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import {
  currentJakartaMonth,
  formatJakartaMonthLabel,
  isFutureJakartaMonth,
  isValidMonth,
  startOfJakartaMonth,
  startOfNextJakartaMonth,
} from "~/lib/shared/datetime";
import { getSession } from "~/server/auth/session";
import { appOrigin } from "~/server/config";
import { prisma } from "~/server/db/prisma";
import { enrichIrrigationEvents, historyEventSelect, type HistoryItem } from "~/server/domain/historyData";
import { buildIrrigationEventWhere } from "~/server/domain/historyQuery";
import {
  acquireHeavyExportSlot,
  HEAVY_EXPORT_BUSY_MESSAGE,
  isHeavyExportQueueFull,
  throwIfAborted,
} from "~/server/export/heavyExport";
import {
  HISTORY_EXPORT_HEADERS,
  maxRowsFor,
  neutralizeSpreadsheetFormula,
  toHistoryExportRow,
  type HistoryExportValue,
} from "~/server/export/historyRows";
import { checkRateLimit, rateLimitResponse } from "~/server/http/rateLimit";

const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Heavy exports share one admission gate: one active build bounds peak RSS
 * (PDF ~320–360MB; XLSX streams to a compressed archive and measured ~20MB
 * incremental peak on Node 25 and ~70MB on Bun 1.3 at the 5,000-row cap) and
 * at most four more may wait. Further requests get a fast 503 retry hint
 * instead of piling up. CSV renders are cheap and bypass the gate entirely.
 *
 * The cheap queue check before `count` is only a hint. The authoritative slot
 * is acquired after the count/preview/empty responses but before the scoped
 * read and enrichment, so the slot is held across the heavy query work and a
 * queued or aborted request never materialises up to 5,000 rows.
 */

const EXPORT_FORMAT_META: Record<ExportFormat, { readonly extension: string; readonly contentType: string }> = {
  csv: { extension: "csv", contentType: "text/csv; charset=utf-8" },
  xlsx: {
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { extension: "pdf", contentType: "application/pdf" },
};

const idParam = z
  .string()
  .trim()
  .min(1, "ID tidak valid.")
  .max(128, "ID tidak valid.")
  .regex(/^[a-zA-Z0-9_-]+$/, "ID tidak valid.");

/**
 * Local query contract for the export endpoint. Deliberately not shared with
 * the statistics schema: the export only accepts a month plus the visible
 * history filters (no `mode`, no date range, no pagination).
 */
const exportQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .refine((value) => isValidMonth(value), "Format bulan harus YYYY-MM."),
  format: z.enum(EXPORT_FORMATS).default("csv"),
  preview: z.literal("1").optional(),
  regionId: idParam.optional(),
  blockId: idParam.optional(),
  status: z.enum(["ON", "OFF"]).optional(),
});

type ExportFilters = {
  readonly regionId?: string;
  readonly blockId?: string;
  readonly status?: "ON" | "OFF";
};

function textResponse(body: string, status: number, headers?: Record<string, string>): Response {
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

function heavyExportBusyResponse(): Response {
  return textResponse(HEAVY_EXPORT_BUSY_MESSAGE, 503, { "Retry-After": "5" });
}

/** Client went away (or aborted the fetch): stop work without a response body. */
function exportAbortedResponse(): Response {
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
 * session check in `GET` still gates the data and the UI download link must
 * keep working without a custom header.
 */
function isCrossSiteRequest(request: Request): boolean {
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

function csvCell(value: HistoryExportValue): string {
  if (value === null) return "";
  const text = String(value);
  if (text === "") return "";

  return `"${neutralizeSpreadsheetFormula(text).replace(/"/g, '""')}"`;
}

function buildCsv(items: HistoryItem[]): string {
  const lines = [
    HISTORY_EXPORT_HEADERS.map(csvCell).join(","),
    ...items.map((item) => toHistoryExportRow(item).map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Derive the PDF filter summary from the already-scoped rows. The `where`
 * clause guarantees every fetched row matches the selected region/block, so
 * the first match is representative and no second lookup by raw id is needed
 * (which also removes an un-scoped read of another region/block name).
 */
function describeExportFilters(filters: ExportFilters, items: readonly HistoryItem[]): string[] {
  const parts: string[] = [];
  const regionId = filters.regionId;
  if (regionId) {
    const regionName = items.find((item) => item.block.region.id === regionId)?.block.region.name;
    parts.push(`Region: ${regionName ?? "-"}`);
  }

  const blockId = filters.blockId;
  if (blockId) {
    const blockName = items.find((item) => item.block.id === blockId)?.block.name;
    parts.push(`Blok: ${blockName ?? "-"}`);
  }

  if (filters.status) parts.push(`Status relay: ${filters.status === "ON" ? "Nyala" : "Mati"}`);
  return parts;
}

/** Row totals surfaced in the response headers and the PDF intro line. */
type ExportSummary = {
  readonly totalCount: number;
  readonly truncated: boolean;
};

/**
 * Heavy renderers are imported per branch so CSV requests never initialise
 * `exceljs` or `pdf-lib` in the server process.
 */
async function buildExportBody(
  signal: AbortSignal,
  items: HistoryItem[],
  month: string,
  format: ExportFormat,
  filters: ExportFilters,
  summary: ExportSummary,
): Promise<Uint8Array> {
  if (format === "csv") {
    throwIfAborted(signal);
    const body = new TextEncoder().encode(buildCsv(items));
    throwIfAborted(signal);
    return body;
  }

  const rows = items.map(toHistoryExportRow);
  if (format === "xlsx") {
    const { buildIrrigationHistoryXlsx } = await import("~/server/export/xlsxTemplate");
    throwIfAborted(signal);
    return buildIrrigationHistoryXlsx({ rows, signal });
  }

  const { buildIrrigationHistoryPdf } = await import("~/server/export/pdfTemplate");
  throwIfAborted(signal);
  return buildIrrigationHistoryPdf({
    month,
    rows,
    totalRows: summary.totalCount,
    filters: describeExportFilters(filters, items),
    generatedAt: new Date(),
    signal,
  });
}

export async function GET(event: APIEvent): Promise<Response> {
  // Read the signal before any await so the adapter attaches its disconnect
  // listener at the start of the request, not just once the render begins.
  const signal = event.request.signal;

  // Reject hostile initiators before the limiter: otherwise a cross-site page
  // could burn the victim's export quota without ever reading a row. The
  // session check below still gates every response that carries data.
  if (isCrossSiteRequest(event.request)) return textResponse("Forbidden", 403);

  // `/api/*` bypasses the authenticated middleware, so the session is checked here.
  const session = await getSession();
  if (!session) return textResponse("Unauthorized", 401);

  const limit = checkRateLimit(`irrigation-export:${session.id}`, 10, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit);

  const params = Object.fromEntries(new URL(event.request.url).searchParams);
  const parsed = exportQuerySchema.safeParse(params);
  if (!parsed.success) {
    return textResponse(
      "Parameter ekspor tidak valid. Bulan wajib berformat YYYY-MM, format harus csv, xlsx, atau pdf, dan filter harus valid.",
      400,
    );
  }

  const { month, format, preview, regionId, blockId, status } = parsed.data;

  if (isFutureJakartaMonth(month)) {
    return textResponse(
      `Bulan ekspor tidak boleh melewati bulan berjalan (WIB). Pilih bulan hingga ${formatJakartaMonthLabel(currentJakartaMonth())}.`,
      400,
    );
  }

  const isHeavyExport = format === "xlsx" || format === "pdf";

  // Reject an already-saturated heavy-export queue before the count/read/
  // enrichment queries. Preview requests only read metadata and bypass this
  // gate; CSV never uses the heavy renderers.
  if (isHeavyExport && preview !== "1" && isHeavyExportQueueFull()) return heavyExportBusyResponse();

  const where = await buildIrrigationEventWhere(session, {
    ...(regionId ? { regionId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(status ? { status } : {}),
    startedAt: { gte: startOfJakartaMonth(month), lt: startOfNextJakartaMonth(month) },
  });

  const formatMeta = EXPORT_FORMAT_META[format];
  const filename = `riwayat-irigasi-${month}.${formatMeta.extension}`;
  const maxRows = maxRowsFor(format);
  const count = await prisma.irrigationEvent.count({ where });
  if (signal.aborted) return exportAbortedResponse();

  // Preview returns the uncapped, scoped count (no rows are materialised) plus
  // the newest-N truncation plan, so the client can explain that an export
  // keeps at most `maxRows` rows before asking for the file.
  if (preview === "1") {
    return new Response(
      JSON.stringify({
        count,
        maxRows,
        filename,
        format,
        exportedCount: Math.min(count, maxRows),
        truncated: count > maxRows,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  if (count === 0) return textResponse(`Tidak ada data riwayat irigasi pada bulan ${month}.`, 404);

  // Count and preview requests returned above, so a slot is only ever held for
  // an actual heavy render. This acquisition is authoritative and happens
  // before the scoped read/enrichment so queued or aborted requests do not
  // materialise up to 5,000 rows; the cheap check before `count` can race.
  let releaseHeavyExport: (() => void) | null = null;

  try {
    if (isHeavyExport) {
      const pendingSlot = acquireHeavyExportSlot(signal);
      if (!pendingSlot) return heavyExportBusyResponse();
      releaseHeavyExport = await pendingSlot;
    }

    // Over-cap exports keep the newest rows instead of failing. The extra row
    // only detects overflow; it is sliced off before enrichment so the derived
    // sensor join and serialisation work stay bounded by `maxRows`. The
    // `count` can be stale (rows inserted or deleted since), so the larger of
    // the two totals is reported and truncation is conservative.
    const rows = await prisma.irrigationEvent.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: maxRows + 1,
      select: historyEventSelect,
    });
    throwIfAborted(signal);

    const fetchedOverflow = rows.length > maxRows;
    const events = fetchedOverflow ? rows.slice(0, maxRows) : rows;
    const totalCount = Math.max(count, rows.length);
    const truncated = totalCount > events.length;

    const items = await enrichIrrigationEvents(events, session.id);
    throwIfAborted(signal);

    const filters: ExportFilters = {
      ...(regionId ? { regionId } : {}),
      ...(blockId ? { blockId } : {}),
      ...(status ? { status } : {}),
    };

    const body = await buildExportBody(signal, items, month, format, filters, { totalCount, truncated });

    // Copy into a fresh buffer so the response owns a standalone `ArrayBuffer`
    // (accepted by `BodyInit`) instead of a view over shared/pooled memory.
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": formatMeta.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Row-Count": String(items.length),
        "X-Export-Total-Count": String(totalCount),
        "X-Export-Truncated": truncated ? "1" : "0",
      },
    });
  } catch (error) {
    // A genuine client disconnect while queued/reading/rendering. Only the
    // request signal maps to 499: an internal or library `AbortError` is a
    // real failure and must propagate. The slot is released in `finally`.
    if (signal.aborted) return exportAbortedResponse();
    throw error;
  } finally {
    releaseHeavyExport?.();
  }
}
