import "server-only";

import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { throwIfAborted, yieldToEventLoop } from "./heavyExport";
import { HISTORY_EXPORT_HEADERS, type HistoryExportRow } from "./historyRows";
import type { ExportColumn, ExportRow } from "./table";

/** Human-scaled widths for the 15 canonical columns, in Excel character units. */
const HISTORY_COLUMN_WIDTHS = [20, 18, 20, 20, 26, 26, 14, 16, 14, 18, 16, 22, 15, 16, 20] as const;
const HISTORY_DURATION_COLUMN = 6;

const HISTORY_COLUMNS: readonly ExportColumn[] = HISTORY_EXPORT_HEADERS.map((header, index) => ({
  header,
  xlsxWidth: HISTORY_COLUMN_WIDTHS[index] ?? 18,
  pdfWeight: 1,
  ...(index === HISTORY_DURATION_COLUMN ? { numeric: true } : {}),
}));

/** Keep each synchronous cell-writing burst short so other requests stay responsive. */
const YIELD_BUDGET_MS = 10;
const ROWS_PER_YIELD = 128;

function xlsxCellValue(value: ExportRow[number]): string | number {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value;
}

/** Monthly irrigation history workbook; see `buildTableXlsx`. */
export async function buildIrrigationHistoryXlsx(input: {
  rows: readonly HistoryExportRow[];
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  return buildTableXlsx({
    sheetName: "Riwayat Irigasi",
    columns: HISTORY_COLUMNS,
    rows: input.rows,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

/**
 * Build a styled single-sheet XLSX workbook from export rows.
 *
 * Rows are written through ExcelJS's streaming writer into a `PassThrough`:
 * every committed row is serialised immediately and streamed into the zip
 * archive, so there is no single whole-workbook `writeBuffer()` block and the
 * workbook model is not retained for the whole build. Plain strings are
 * serialised as `t="str"` text cells (no shared-strings table and no `<f>`
 * element), never as formula cells, so leading `=`, `+`, `-` or `@` stay
 * literal text. Unlike CSV, no apostrophe prefix is needed and the original
 * value is preserved.
 */
export async function buildTableXlsx(input: {
  sheetName: string;
  columns: readonly ExportColumn[];
  rows: readonly ExportRow[];
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  throwIfAborted(input.signal);

  const chunks: Buffer[] = [];
  const sink = new PassThrough({ highWaterMark: 16 * 1024 });
  sink.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    sink.once("end", resolve);
    sink.once("error", reject);
  });
  // An abort or row error can throw before `finished` is ever awaited; keep
  // that expected rejection from surfacing as an unhandled rejection.
  void finished.catch(() => {});

  // ExcelJS 4.4 reads `created` from the writer options at runtime but omits
  // it from `WorkbookWriterOptions`, hence the widened literal.
  const workbookOptions: Partial<ExcelJS.stream.xlsx.WorkbookStreamWriterOptions> & { created: Date } = {
    stream: sink,
    useStyles: true,
    useSharedStrings: false,
    created: new Date(),
  };
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(workbookOptions);
  workbook.creator = "Adosistering";
  workbook.lastModifiedBy = "Adosistering";

  try {
    const sheet = workbook.addWorksheet(input.sheetName, {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    sheet.columns = input.columns.map((column, index) => ({
      header: column.header,
      key: `column-${index + 1}`,
      width: column.xlsxWidth,
    }));

    // Column styles apply to every cell in the column, so the same font,
    // alignment and number format objects are shared instead of rebuilt for
    // each of up to 5000 rows. Header cell styles below override the font and
    // alignment; their number format is reset to General for parity with the
    // previous per-cell implementation.
    for (const [index, definition] of input.columns.entries()) {
      const column = sheet.getColumn(index + 1);
      column.font = { size: 10 };
      column.alignment = { vertical: "middle", horizontal: definition.numeric ? "right" : "left" };
      column.numFmt = definition.numeric ? "0" : "@";
    }

    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF065F46" } } };
      cell.numFmt = "General";
    });
    // The streaming writer only sends a row to the zip when it is committed;
    // the header must land before the data rows that follow it.
    headerRow.commit();

    let lastYieldAt = performance.now();
    let rowsSinceYield = 0;

    for (const [index, rowValues] of input.rows.entries()) {
      throwIfAborted(input.signal);

      const row = sheet.addRow(rowValues.map(xlsxCellValue));
      row.height = 18;
      // One border per row (alternating shade) instead of one object per cell.
      row.border = {
        bottom: {
          style: "hair",
          color: { argb: index % 2 === 0 ? "FFE2E8F0" : "FFF1F5F9" },
        },
      };
      row.commit();

      rowsSinceYield += 1;
      if (rowsSinceYield >= ROWS_PER_YIELD || performance.now() - lastYieldAt >= YIELD_BUDGET_MS) {
        await yieldToEventLoop();
        throwIfAborted(input.signal);
        lastYieldAt = performance.now();
        rowsSinceYield = 0;
      }
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(input.rows.length + 1, 1), column: input.columns.length },
    };

    throwIfAborted(input.signal);
    // Writing continues to the sink while the worksheet is finalised; the
    // signal is re-checked after the zip has flushed.
    await workbook.commit();
    await finished;
    throwIfAborted(input.signal);

    return new Uint8Array(Buffer.concat(chunks));
  } catch (error) {
    // Abandon the half-written archive. `destroy()` without an error emits no
    // 'error' event, but the zip may still attempt a late write; absorb that
    // and rethrow the original failure unchanged.
    sink.on("error", () => {});
    sink.destroy();
    throw error;
  }
}
