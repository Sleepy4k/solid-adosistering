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
  EXPORT_MAX_ROWS,
  HISTORY_EXPORT_HEADERS,
  maxRowsFor,
  neutralizeSpreadsheetFormula,
  PDF_MAX_ROWS,
  toHistoryExportRow,
  type HistoryExportValue,
} from "~/server/export/historyRows";
import { checkRateLimit, rateLimitResponse } from "~/server/http/rateLimit";

const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * `pdf-lib` builds the whole document synchronously, so a second concurrent
 * build yields no throughput and only doubles peak memory. One active build
 * plus a bounded FIFO queue keeps latency predictable; the rest get a fast 503
 * retry hint instead of piling up.
 */
const PDF_CONCURRENCY_LIMIT = 1;
const PDF_QUEUE_LIMIT = 4;
const PDF_BUSY_MESSAGE = "Server sedang membuat ekspor PDF lain. Coba lagi dalam beberapa detik.";

let activePdfBuilds = 0;
const pdfQueue: Array<() => void> = [];

/** Cheap gate before count/read work; the acquire below remains authoritative. */
function isPdfQueueFull(): boolean {
  return pdfQueue.length >= PDF_QUEUE_LIMIT;
}

/** Idempotent release token so a double `finally` can never free two slots. */
function createPdfSlotRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releasePdfSlot();
  };
}

function releasePdfSlot(): void {
  const next = pdfQueue.shift();
  if (next) {
    // Hand the slot straight to the next waiter: `activePdfBuilds` stays full.
    next();
    return;
  }
  activePdfBuilds = Math.max(activePdfBuilds - 1, 0);
}

/**
 * Reserve a PDF build slot, or `null` when the queue is full. Callers must
 * await the returned promise and invoke its token exactly once in `finally`.
 */
function acquirePdfSlot(): Promise<() => void> | null {
  if (activePdfBuilds < PDF_CONCURRENCY_LIMIT) {
    activePdfBuilds += 1;
    return Promise.resolve(createPdfSlotRelease());
  }
  if (pdfQueue.length >= PDF_QUEUE_LIMIT) return null;

  return new Promise<() => void>((resolve) => {
    pdfQueue.push(() => resolve(createPdfSlotRelease()));
  });
}

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

function pdfBusyResponse(): Response {
  return textResponse(PDF_BUSY_MESSAGE, 503, { "Retry-After": "5" });
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

/**
 * Heavy renderers are imported per branch so CSV requests never initialise
 * `exceljs` or `pdf-lib` in the server process.
 */
async function buildExportBody(
  items: HistoryItem[],
  month: string,
  format: ExportFormat,
  filters: ExportFilters,
): Promise<Uint8Array> {
  if (format === "csv") return new TextEncoder().encode(buildCsv(items));

  const rows = items.map(toHistoryExportRow);
  if (format === "xlsx") {
    const { buildIrrigationHistoryXlsx } = await import("~/server/export/xlsxTemplate");
    return buildIrrigationHistoryXlsx({ rows });
  }

  const { buildIrrigationHistoryPdf } = await import("~/server/export/pdfTemplate");
  return buildIrrigationHistoryPdf({
    month,
    rows,
    filters: describeExportFilters(filters, items),
    generatedAt: new Date(),
  });
}

/**
 * Explain the per-format cap in the 413 body: PDF is intentionally lower, and
 * the user can switch to CSV/Excel when the dataset fits the tabular cap.
 */
function exportLimitMessage(format: ExportFormat, count: number, month?: string): string {
  const subject = month ? `Data pada bulan ${month}` : `Jumlah data ${count} baris`;
  const cap = maxRowsFor(format);

  if (format === "pdf") {
    return (
      `${subject} melebihi batas ekspor PDF ${PDF_MAX_ROWS} baris. ` +
      `Ekspor PDF dibatasi karena proses render yang berat; gunakan CSV atau Excel untuk ekspor hingga ` +
      `${EXPORT_MAX_ROWS} baris, atau persempit periode/filter lalu coba lagi.`
    );
  }

  return `${subject} melebihi batas ekspor ${cap} baris. Persempit periode atau filter lalu coba lagi.`;
}

export async function GET(event: APIEvent): Promise<Response> {
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

  // Reject an already-saturated PDF queue before the count/read/enrichment
  // queries. Preview requests only read metadata and always bypass this gate;
  // CSV/XLSX do not use the PDF semaphore at all.
  if (format === "pdf" && preview !== "1" && isPdfQueueFull()) return pdfBusyResponse();

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

  if (count > maxRows) return textResponse(exportLimitMessage(format, count), 413);

  if (preview === "1") {
    return new Response(JSON.stringify({ count, maxRows, filename, format }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (count === 0) return textResponse(`Tidak ada data riwayat irigasi pada bulan ${month}.`, 404);

  // Re-check the cap on the read itself: rows can be inserted between the
  // `count` above and this query. Fetching one extra row avoids silently
  // truncating an export that crossed the limit in that window.
  const events = await prisma.irrigationEvent.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: maxRows + 1,
    select: historyEventSelect,
  });
  if (events.length > maxRows) return textResponse(exportLimitMessage(format, events.length, month), 413);

  const items = await enrichIrrigationEvents(events, session.id);
  const filters: ExportFilters = {
    ...(regionId ? { regionId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(status ? { status } : {}),
  };

  // Count and preview requests returned above, so a slot is only ever held for
  // an actual PDF render. CSV/XLSX skip the limiter entirely.
  let releasePdfSlot: (() => void) | null = null;
  if (format === "pdf") {
    const pendingSlot = acquirePdfSlot();
    if (!pendingSlot) return pdfBusyResponse();
    releasePdfSlot = await pendingSlot;
  }

  try {
    const body = await buildExportBody(items, month, format, filters);

    // Copying into a fresh view narrows `ArrayBufferLike` to `ArrayBuffer`,
    // which is what the DOM `BodyInit` type accepts.
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": formatMeta.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    releasePdfSlot?.();
  }
}
