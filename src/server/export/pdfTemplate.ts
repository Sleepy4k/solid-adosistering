import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatJakartaDateTime, formatJakartaMonthLabel } from "~/lib/shared/datetime";
import { throwIfAborted, yieldToEventLoop } from "./heavyExport";
import { HISTORY_EXPORT_HEADERS, displayExportValue, type HistoryExportRow } from "./historyRows";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN;
const CONTENT_BOTTOM = 34;

const TITLE_FONT_SIZE = 16;
const META_FONT_SIZE = 8;
const META_LINE_HEIGHT = 11;
const HEADER_FONT_SIZE = 6.8;
const HEADER_LINE_HEIGHT = 7.8;
const HEADER_PADDING_Y = 4;
const TABLE_FONT_SIZE = 6.5;
const TABLE_ROW_HEIGHT = 13;
const CELL_PADDING_X = 3;

/** Keep each synchronous drawing burst short so other requests stay responsive. */
const YIELD_BUDGET_MS = 10;
const ROWS_PER_YIELD = 64;

const COLOR_TEXT = rgb(0.12, 0.16, 0.22);
const COLOR_MUTED = rgb(0.42, 0.45, 0.5);
const COLOR_HEADER_FILL = rgb(0.02, 0.36, 0.26);
const COLOR_HEADER_TEXT = rgb(1, 1, 1);
const COLOR_ALT_FILL = rgb(0.97, 0.98, 0.98);
const COLOR_RULE = rgb(0.89, 0.91, 0.94);

type PdfColumn = {
  readonly header: string;
  readonly weight: number;
  readonly align?: "left" | "right";
};

/**
 * Compact landscape columns. Widths are relative weights, scaled to the
 * printable A4 width so the same definition works for every page size tweak.
 */
const PDF_COLUMNS: readonly PdfColumn[] = [
  { header: HISTORY_EXPORT_HEADERS[0], weight: 56 },
  { header: HISTORY_EXPORT_HEADERS[1], weight: 50 },
  { header: HISTORY_EXPORT_HEADERS[2], weight: 58 },
  { header: HISTORY_EXPORT_HEADERS[3], weight: 64 },
  { header: HISTORY_EXPORT_HEADERS[4], weight: 76 },
  { header: HISTORY_EXPORT_HEADERS[5], weight: 76 },
  { header: HISTORY_EXPORT_HEADERS[6], weight: 34, align: "right" },
  { header: HISTORY_EXPORT_HEADERS[7], weight: 44 },
  { header: HISTORY_EXPORT_HEADERS[8], weight: 34 },
  { header: HISTORY_EXPORT_HEADERS[9], weight: 52 },
  { header: HISTORY_EXPORT_HEADERS[10], weight: 40, align: "right" },
  { header: HISTORY_EXPORT_HEADERS[11], weight: 46, align: "right" },
  { header: HISTORY_EXPORT_HEADERS[12], weight: 46, align: "right" },
  { header: HISTORY_EXPORT_HEADERS[13], weight: 42 },
  { header: HISTORY_EXPORT_HEADERS[14], weight: 48 },
];

/**
 * Characters outside this set are not encodable by the standard Helvetica
 * fonts (WinAnsi encoding) and would make `drawText` throw. They are replaced
 * with `?`; PDF text is not HTML, so no escaping is applied.
 */
const WINANSI_EXTRA = new Set([
  "\u20AC",
  "\u201A",
  "\u0192",
  "\u201E",
  "\u2026",
  "\u2020",
  "\u2021",
  "\u02C6",
  "\u2030",
  "\u0160",
  "\u2039",
  "\u0152",
  "\u017D",
  "\u2018",
  "\u2019",
  "\u201C",
  "\u201D",
  "\u2022",
  "\u2013",
  "\u2014",
  "\u02DC",
  "\u2122",
  "\u0161",
  "\u203A",
  "\u0153",
  "\u017E",
  "\u0178",
]);

export function sanitizePdfText(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const supported =
      codePoint !== undefined &&
      ((codePoint >= 0x20 && codePoint <= 0x7e) ||
        (codePoint >= 0xa0 && codePoint <= 0xff) ||
        WINANSI_EXTRA.has(character));
    result += supported ? character : "?";
  }
  return result;
}

type TableLayout = {
  readonly widths: number[];
  readonly headerLines: string[][];
  readonly headerHeight: number;
};

export type IrrigationHistoryPdfOptions = {
  readonly month: string;
  readonly rows: readonly HistoryExportRow[];
  readonly filters: readonly string[];
  readonly generatedAt: Date;
  readonly signal?: AbortSignal;
};

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (text === "" || maxWidth <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  const ellipsis = "\u2026";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + ellipsis, size) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low === 0 ? "" : `${text.slice(0, low)}${ellipsis}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = font.widthOfTextAtSize(word, size) <= maxWidth ? word : fitText(word, font, size, maxWidth);
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function buildTableLayout(font: PDFFont): TableLayout {
  const totalWeight = PDF_COLUMNS.reduce((sum, column) => sum + column.weight, 0);
  const widths = PDF_COLUMNS.map((column) => (column.weight / totalWeight) * CONTENT_WIDTH);
  const headerLines = PDF_COLUMNS.map((column, index) =>
    wrapText(column.header, font, HEADER_FONT_SIZE, (widths[index] ?? 0) - CELL_PADDING_X * 2),
  );
  const maxLineCount = Math.max(...headerLines.map((lines) => lines.length), 1);

  return {
    widths,
    headerLines,
    headerHeight: maxLineCount * HEADER_LINE_HEIGHT + HEADER_PADDING_Y * 2,
  };
}

function drawIntro(
  page: PDFPage,
  options: IrrigationHistoryPdfOptions,
  regularFont: PDFFont,
  boldFont: PDFFont,
): number {
  let y = CONTENT_TOP;
  page.drawText("Riwayat Irigasi", {
    x: MARGIN,
    y: y - 14,
    size: TITLE_FONT_SIZE,
    font: boldFont,
    color: COLOR_TEXT,
  });
  y -= 28;

  const filterSummary = options.filters.length > 0 ? options.filters.join(" | ") : "Semua region, lahan, dan status";
  const metaLines = [
    `Periode: ${formatJakartaMonthLabel(options.month)}`,
    `Filter: ${filterSummary}`,
    `Dibuat: ${formatJakartaDateTime(options.generatedAt)}`,
    `Total: ${options.rows.length} baris`,
  ];

  for (const line of metaLines) {
    const text = fitText(sanitizePdfText(line), regularFont, META_FONT_SIZE, CONTENT_WIDTH);
    if (text) {
      page.drawText(text, {
        x: MARGIN,
        y,
        size: META_FONT_SIZE,
        font: regularFont,
        color: COLOR_MUTED,
      });
    }
    y -= META_LINE_HEIGHT;
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y + 4 },
    thickness: 0.5,
    color: COLOR_RULE,
  });

  return y;
}

function drawContinuationHeader(
  page: PDFPage,
  options: IrrigationHistoryPdfOptions,
  regularFont: PDFFont,
  boldFont: PDFFont,
): number {
  page.drawText("Riwayat Irigasi", {
    x: MARGIN,
    y: CONTENT_TOP - 10,
    size: 10,
    font: boldFont,
    color: COLOR_TEXT,
  });

  const period = fitText(
    sanitizePdfText(`Periode: ${formatJakartaMonthLabel(options.month)}`),
    regularFont,
    8,
    CONTENT_WIDTH / 2,
  );
  if (period) {
    const width = regularFont.widthOfTextAtSize(period, 8);
    page.drawText(period, {
      x: MARGIN + CONTENT_WIDTH - width,
      y: CONTENT_TOP - 9.5,
      size: 8,
      font: regularFont,
      color: COLOR_MUTED,
    });
  }

  return CONTENT_TOP - 22;
}

function drawTableHeader(page: PDFPage, topY: number, layout: TableLayout, boldFont: PDFFont): number {
  const bottomY = topY - layout.headerHeight;
  page.drawRectangle({
    x: MARGIN,
    y: bottomY,
    width: CONTENT_WIDTH,
    height: layout.headerHeight,
    color: COLOR_HEADER_FILL,
  });

  let x = MARGIN;
  for (let index = 0; index < PDF_COLUMNS.length; index += 1) {
    const width = layout.widths[index] ?? 0;
    const lines = layout.headerLines[index] ?? [];
    let baseline = topY - HEADER_PADDING_Y - HEADER_FONT_SIZE;

    for (const line of lines) {
      const text = fitText(line, boldFont, HEADER_FONT_SIZE, width - CELL_PADDING_X * 2);
      if (text) {
        page.drawText(text, {
          x: x + CELL_PADDING_X,
          y: baseline,
          size: HEADER_FONT_SIZE,
          font: boldFont,
          color: COLOR_HEADER_TEXT,
        });
      }
      baseline -= HEADER_LINE_HEIGHT;
    }

    x += width;
  }

  return bottomY;
}

function drawTableRow(
  page: PDFPage,
  topY: number,
  row: HistoryExportRow,
  rowIndex: number,
  layout: TableLayout,
  font: PDFFont,
): void {
  const bottomY = topY - TABLE_ROW_HEIGHT;

  if (rowIndex % 2 === 1) {
    page.drawRectangle({
      x: MARGIN,
      y: bottomY,
      width: CONTENT_WIDTH,
      height: TABLE_ROW_HEIGHT,
      color: COLOR_ALT_FILL,
    });
  }

  page.drawLine({
    start: { x: MARGIN, y: bottomY },
    end: { x: MARGIN + CONTENT_WIDTH, y: bottomY },
    thickness: 0.35,
    color: COLOR_RULE,
  });

  let x = MARGIN;
  for (let index = 0; index < PDF_COLUMNS.length; index += 1) {
    const width = layout.widths[index] ?? 0;
    const value = row[index] ?? null;
    const text = fitText(sanitizePdfText(displayExportValue(value)), font, TABLE_FONT_SIZE, width - CELL_PADDING_X * 2);

    if (text) {
      const textWidth = font.widthOfTextAtSize(text, TABLE_FONT_SIZE);
      const drawX = PDF_COLUMNS[index]?.align === "right" ? x + width - CELL_PADDING_X - textWidth : x + CELL_PADDING_X;
      page.drawText(text, {
        x: drawX,
        y: topY - TABLE_ROW_HEIGHT + 4.2,
        size: TABLE_FONT_SIZE,
        font,
        color: COLOR_TEXT,
      });
    }

    x += width;
  }
}

function drawFooters(pages: readonly PDFPage[], font: PDFFont): void {
  const total = pages.length;
  pages.forEach((page, index) => {
    const label = `Halaman ${index + 1} dari ${total}`;
    const width = font.widthOfTextAtSize(label, 7);
    page.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: 18,
      size: 7,
      font,
      color: COLOR_MUTED,
    });
  });
}

/**
 * Render the monthly irrigation history as a landscape A4 PDF. The table
 * repeats its header on every page and truncates each cell to its column with
 * an ellipsis. An empty row list still produces a valid one-page document.
 */
export async function buildIrrigationHistoryPdf(options: IrrigationHistoryPdfOptions): Promise<Uint8Array> {
  throwIfAborted(options.signal);

  const document = await PDFDocument.create();
  const generatedAt = Number.isFinite(options.generatedAt.getTime()) ? options.generatedAt : new Date();

  document.setTitle("Riwayat Irigasi");
  document.setAuthor("Adosistering");
  document.setSubject(`Riwayat irigasi ${formatJakartaMonthLabel(options.month)}`);
  document.setCreator("Adosistering");
  document.setProducer("Adosistering");
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);

  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const layout = buildTableLayout(boldFont);
  const pages: PDFPage[] = [];

  const startPage = (first: boolean) => {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    const tableTop = first
      ? drawIntro(page, options, regularFont, boldFont)
      : drawContinuationHeader(page, options, regularFont, boldFont);
    return { page, tableTop: drawTableHeader(page, tableTop, layout, boldFont) };
  };

  let current = startPage(true);

  if (options.rows.length === 0) {
    const message = fitText(
      sanitizePdfText("Tidak ada data pada periode ini."),
      regularFont,
      META_FONT_SIZE,
      CONTENT_WIDTH,
    );
    current.page.drawText(message, {
      x: MARGIN,
      y: current.tableTop - 16,
      size: META_FONT_SIZE,
      font: regularFont,
      color: COLOR_MUTED,
    });
  } else {
    let lastYieldAt = performance.now();
    let rowsSinceYield = 0;

    for (const [rowIndex, row] of options.rows.entries()) {
      throwIfAborted(options.signal);

      if (current.tableTop - TABLE_ROW_HEIGHT < CONTENT_BOTTOM) {
        current = startPage(false);
      }
      drawTableRow(current.page, current.tableTop, row, rowIndex, layout, regularFont);
      current.tableTop -= TABLE_ROW_HEIGHT;

      rowsSinceYield += 1;
      if (rowsSinceYield >= ROWS_PER_YIELD || performance.now() - lastYieldAt >= YIELD_BUDGET_MS) {
        await yieldToEventLoop();
        throwIfAborted(options.signal);
        lastYieldAt = performance.now();
        rowsSinceYield = 0;
      }
    }
  }

  throwIfAborted(options.signal);
  drawFooters(pages, regularFont);

  throwIfAborted(options.signal);
  const bytes = await document.save({ objectsPerTick: 4 });
  throwIfAborted(options.signal);
  return bytes;
}
