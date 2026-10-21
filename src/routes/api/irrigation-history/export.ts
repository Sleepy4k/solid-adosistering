import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import {
  formatJakartaDateTime,
  isValidMonth,
  startOfJakartaMonth,
  startOfNextJakartaMonth,
} from "~/lib/shared/datetime";
import { getSession } from "~/server/auth/session";
import { appOrigin } from "~/server/config";
import { prisma } from "~/server/db/prisma";
import { enrichIrrigationEvents, historyEventSelect, type HistoryItem } from "~/server/domain/historyData";
import { buildIrrigationEventWhere } from "~/server/domain/historyQuery";
import { checkRateLimit, rateLimitResponse } from "~/server/http/rateLimit";

/** Hard cap so one request cannot materialise an unbounded CSV in memory. */
const EXPORT_MAX_ROWS = 5000;

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
  preview: z.literal("1").optional(),
  regionId: idParam.optional(),
  blockId: idParam.optional(),
  status: z.enum(["ON", "OFF"]).optional(),
});

const CSV_HEADERS = [
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

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
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

function escapeSpreadsheetFormula(value: string): string {
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (text === "") return "";

  return `"${escapeSpreadsheetFormula(text).replace(/"/g, '""')}"`;
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

function toCsvRow(item: HistoryItem): string {
  const mode = item.mode === "AUTO" ? "Otomatis" : "Manual";
  const relay = item.relay === "ON" ? "Nyala" : "Mati";
  const eventStatus = item.relay === "ON" && !item.endedAt ? "Irigasi Aktif" : "Irigasi Selesai";

  return [
    csvCell(item.block.region.name),
    csvCell(item.block.name),
    csvCell(item.sprayer.displayName),
    csvCell(item.sprayer.hardwareId),
    csvCell(formatJakartaDateTime(item.startedAt)),
    csvCell(item.endedAt ? formatJakartaDateTime(item.endedAt) : null),
    csvCell(item.durationSeconds),
    csvCell(mode),
    csvCell(relay),
    csvCell(eventStatus),
    csvCell(formatDecimal(item.totalVolumeLiter)),
    csvCell(averageFlowLmin(item)),
    csvCell(item.sensor ? formatDecimal(item.sensor.moisturePercent) : null),
    csvCell(item.sensor ? moistureLabel(item.sensor.moistureStatus) : null),
    csvCell(item.actor?.name ?? null),
  ].join(",");
}

function buildCsv(items: HistoryItem[]): string {
  const lines = [CSV_HEADERS.map((header) => csvCell(header)).join(","), ...items.map(toCsvRow)];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
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
    return textResponse("Parameter ekspor tidak valid. Bulan wajib berformat YYYY-MM dan filter harus valid.", 400);
  }

  const { month, preview, regionId, blockId, status } = parsed.data;

  const where = await buildIrrigationEventWhere(session, {
    ...(regionId ? { regionId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(status ? { status } : {}),
    startedAt: { gte: startOfJakartaMonth(month), lt: startOfNextJakartaMonth(month) },
  });

  const filename = `riwayat-irigasi-${month}.csv`;
  const count = await prisma.irrigationEvent.count({ where });

  if (count > EXPORT_MAX_ROWS) {
    return textResponse(
      `Jumlah data ${count} baris melebihi batas ekspor ${EXPORT_MAX_ROWS} baris. Persempit periode atau filter lalu coba lagi.`,
      413,
    );
  }

  if (preview === "1") {
    return new Response(JSON.stringify({ count, maxRows: EXPORT_MAX_ROWS, filename }), {
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
    take: EXPORT_MAX_ROWS + 1,
    select: historyEventSelect,
  });
  if (events.length > EXPORT_MAX_ROWS) {
    return textResponse(
      `Data pada bulan ${month} melebihi batas ekspor ${EXPORT_MAX_ROWS} baris. Persempit periode atau filter lalu coba lagi.`,
      413,
    );
  }
  const items = await enrichIrrigationEvents(events, session.id);

  return new Response(buildCsv(items), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
