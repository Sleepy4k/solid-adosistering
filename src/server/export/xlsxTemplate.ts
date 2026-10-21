import "server-only";

import ExcelJS from "exceljs";
import { HISTORY_EXPORT_HEADERS, type HistoryExportRow } from "./historyRows";

const WORKSHEET_NAME = "Riwayat Irigasi";

/** Human-scaled widths for the 15 canonical columns, in Excel character units. */
const COLUMN_WIDTHS = [20, 18, 20, 20, 26, 26, 14, 16, 14, 18, 16, 22, 15, 16, 20] as const;

function xlsxCellValue(value: HistoryExportRow[number]): string | number {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value;
}

/**
 * Build a styled XLSX workbook for the monthly irrigation history export.
 * ExcelJS serialises plain strings as shared-string cells (`t="s"`), never as
 * formula cells, so leading `=`, `+`, `-` or `@` stay literal text. Unlike
 * CSV, no apostrophe prefix is needed and the original value is preserved.
 */
export async function buildIrrigationHistoryXlsx(input: { rows: readonly HistoryExportRow[] }): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Adosistering";
  workbook.lastModifiedBy = "Adosistering";
  workbook.title = WORKSHEET_NAME;
  workbook.created = new Date();
  workbook.modified = workbook.created;

  const sheet = workbook.addWorksheet(WORKSHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = HISTORY_EXPORT_HEADERS.map((header, index) => ({
    header,
    key: `column-${index + 1}`,
    width: COLUMN_WIDTHS[index] ?? 18,
  }));

  // Column styles apply to every cell in the column, so the same font,
  // alignment and number format objects are shared instead of rebuilt for each
  // of up to 5000 x 15 cells. Header cell styles below override the font and
  // alignment; their number format is reset to General for parity with the
  // previous per-cell implementation.
  for (let index = 1; index <= HISTORY_EXPORT_HEADERS.length; index += 1) {
    const column = sheet.getColumn(index);
    const isDuration = index === 7;
    column.font = { size: 10 };
    column.alignment = { vertical: "middle", horizontal: isDuration ? "right" : "left" };
    column.numFmt = isDuration ? "0" : "@";
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

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(input.rows.length + 1, 1), column: HISTORY_EXPORT_HEADERS.length },
  };

  for (const [index, rowValues] of input.rows.entries()) {
    const row = sheet.addRow(rowValues.map(xlsxCellValue));
    row.height = 18;
    // One border per row (alternating shade) instead of one object per cell.
    row.border = {
      bottom: {
        style: "hair",
        color: { argb: index % 2 === 0 ? "FFE2E8F0" : "FFF1F5F9" },
      },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
