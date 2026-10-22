import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import {
  endOfJakartaDayExclusive,
  formatJakartaDate,
  inclusiveJakartaDayCount,
  isValidDateOnly,
  jakartaDateKey,
  startOfJakartaDay,
} from "~/lib/shared/datetime";
import { MAX_EXPORT_RANGE_DAYS } from "~/lib/shared/exportRange";
import { getSession } from "~/server/auth/session";
import { getExportDataset, type ExportDataset, type ExportDateRange } from "~/server/export/datasets";
import { acquireHeavyExportSlot, isHeavyExportQueueFull, throwIfAborted } from "~/server/export/heavyExport";
import { maxRowsFor } from "~/server/export/historyRows";
import {
  buildCsv,
  csvHeaders,
  EXPORT_FORMAT_META,
  EXPORT_FORMATS,
  exportAbortedResponse,
  heavyExportBusyResponse,
  isCrossSiteRequest,
  jsonResponse,
  textResponse,
} from "~/server/export/http";
import type { ExportFormat, ExportRow } from "~/server/export/table";
import { checkRateLimit, rateLimitResponse } from "~/server/http/rateLimit";

/**
 * Generic table export for the admin pages (logs, users, regions, landing CMS).
 * It follows the irrigation export's contract: `preview=1` returns the scoped
 * count and file name without reading rows, heavy formats share the
 * single-slot render gate, and over-cap exports keep the first `maxRows` rows
 * in dataset order (newest first for logs) instead of failing.
 */

const dateParam = z
  .string()
  .trim()
  .refine((value) => isValidDateOnly(value), "Format tanggal harus YYYY-MM-DD.");

const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).default("csv"),
  preview: z.literal("1").optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
});

type RangeResult = { readonly range?: ExportDateRange; readonly label: string } | { readonly error: string };

function resolveRange(dataset: ExportDataset, from?: string, to?: string): RangeResult {
  if (!from && !to) {
    if (dataset.dateRange === "required") return { error: "Tanggal mulai dan tanggal akhir wajib diisi." };
    return { label: "Semua data" };
  }
  if (!from || !to) return { error: "Isi tanggal mulai dan tanggal akhir, atau kosongkan keduanya." };

  const days = inclusiveJakartaDayCount(from, to);
  if (!Number.isFinite(days)) return { error: "Tanggal mulai tidak boleh setelah tanggal akhir." };
  if (days > MAX_EXPORT_RANGE_DAYS) {
    return { error: `Rentang tanggal maksimal ${MAX_EXPORT_RANGE_DAYS} hari (1 bulan).` };
  }
  if (to > jakartaDateKey(new Date())) return { error: "Tanggal akhir tidak boleh melewati hari ini (WIB)." };

  return {
    range: { gte: startOfJakartaDay(from), lt: endOfJakartaDayExclusive(to) },
    label: `${formatJakartaDate(startOfJakartaDay(from))} s/d ${formatJakartaDate(startOfJakartaDay(to))}`,
  };
}

/** Dataset filters are every query parameter the envelope does not own. */
function datasetParams(params: Record<string, string>): Record<string, string> {
  const { format: _format, preview: _preview, from: _from, to: _to, ...rest } = params;
  return Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== ""));
}

async function buildBody(input: {
  readonly signal: AbortSignal;
  readonly dataset: ExportDataset;
  readonly format: ExportFormat;
  readonly rows: ExportRow[];
  readonly totalCount: number;
  readonly periodLabel: string;
  readonly filters: readonly string[];
}): Promise<Uint8Array> {
  const { signal, dataset, format, rows } = input;
  if (format === "csv") {
    throwIfAborted(signal);
    return new TextEncoder().encode(buildCsv(csvHeaders(dataset.columns), rows));
  }

  if (format === "xlsx") {
    const { buildTableXlsx } = await import("~/server/export/xlsxTemplate");
    throwIfAborted(signal);
    return buildTableXlsx({ sheetName: dataset.title.slice(0, 31), columns: dataset.columns, rows, signal });
  }

  const { buildTablePdf } = await import("~/server/export/pdfTemplate");
  throwIfAborted(signal);
  const period = `${dataset.dateField}: ${input.periodLabel}`;
  return buildTablePdf({
    title: dataset.title,
    subject: `${dataset.title} (${input.periodLabel})`,
    introLines: [period, `Filter: ${input.filters.length > 0 ? input.filters.join(" | ") : "Tidak ada"}`],
    continuationLabel: period,
    columns: dataset.columns,
    rows,
    totalRows: input.totalCount,
    truncatedRowsLabel: dataset.order === "newest-first" ? "baris terbaru" : "baris pertama",
    generatedAt: new Date(),
    signal,
  });
}

export async function GET(event: APIEvent): Promise<Response> {
  // Read the signal before any await so the disconnect listener is attached
  // for the whole request.
  const signal = event.request.signal;

  if (isCrossSiteRequest(event.request)) return textResponse("Forbidden", 403);

  // `/api/*` bypasses the authenticated middleware, so the session is checked here.
  const session = await getSession();
  if (!session) return textResponse("Unauthorized", 401);

  const dataset = getExportDataset(event.params.dataset ?? "");
  if (!dataset) return textResponse("Data ekspor tidak ditemukan.", 404);
  if (!dataset.allow(session)) return textResponse("Anda tidak memiliki akses ke data ini.", 403);

  const limit = checkRateLimit(`table-export:${session.id}`, 10, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit);

  const params = Object.fromEntries(new URL(event.request.url).searchParams);
  const parsed = exportQuerySchema.safeParse(params);
  if (!parsed.success) {
    return textResponse(
      "Parameter ekspor tidak valid. Format harus csv, xlsx, atau pdf dan tanggal berformat YYYY-MM-DD.",
      400,
    );
  }
  const { format, preview, from, to } = parsed.data;

  const resolved = resolveRange(dataset, from, to);
  if ("error" in resolved) return textResponse(resolved.error, 400);

  const opened = await dataset.open(session, datasetParams(params), resolved.range);
  if ("error" in opened) return textResponse(opened.error, 400);

  const isHeavyExport = format === "xlsx" || format === "pdf";
  if (isHeavyExport && preview !== "1" && isHeavyExportQueueFull()) return heavyExportBusyResponse();

  const formatMeta = EXPORT_FORMAT_META[format];
  const suffix = from && to ? `${from}_sd_${to}` : `semua-${jakartaDateKey(new Date())}`;
  const filename = `${dataset.filenamePrefix}-${suffix}.${formatMeta.extension}`;
  const maxRows = maxRowsFor(format);
  const count = opened.prepared ? await opened.prepared.count() : 0;
  if (signal.aborted) return exportAbortedResponse();

  if (preview === "1") {
    return jsonResponse({
      count,
      maxRows,
      filename,
      format,
      exportedCount: Math.min(count, maxRows),
      truncated: count > maxRows,
      order: dataset.order,
    });
  }

  if (count === 0 || !opened.prepared) return textResponse("Tidak ada data pada periode yang dipilih.", 404);

  let releaseHeavyExport: (() => void) | null = null;
  try {
    if (isHeavyExport) {
      const pendingSlot = acquireHeavyExportSlot(signal);
      if (!pendingSlot) return heavyExportBusyResponse();
      releaseHeavyExport = await pendingSlot;
    }

    // One extra row detects overflow without trusting a possibly stale count.
    const fetched = await opened.prepared.rows(maxRows + 1);
    throwIfAborted(signal);
    const rows = fetched.length > maxRows ? fetched.slice(0, maxRows) : fetched;
    const totalCount = Math.max(count, fetched.length);
    const truncated = totalCount > rows.length;

    const body = await buildBody({
      signal,
      dataset,
      format,
      rows,
      totalCount,
      periodLabel: resolved.label,
      filters: opened.filters,
    });

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": formatMeta.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Row-Count": String(rows.length),
        "X-Export-Total-Count": String(totalCount),
        "X-Export-Truncated": truncated ? "1" : "0",
      },
    });
  } catch (error) {
    if (signal.aborted) return exportAbortedResponse();
    throw error;
  } finally {
    releaseHeavyExport?.();
  }
}
