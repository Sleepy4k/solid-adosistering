/**
 * Format-agnostic table model shared by the CSV, XLSX, and PDF renderers.
 * Datasets project their records onto `ExportRow`s aligned with their
 * `ExportColumn`s; renderers never reach back into Prisma types.
 */

export type ExportValue = string | number | null;

export type ExportRow = ExportValue[];

export type ExportColumn = {
  readonly header: string;
  /** XLSX column width in Excel character units. */
  readonly xlsxWidth: number;
  /** Relative PDF column width; scaled to the printable page width. */
  readonly pdfWeight: number;
  /** Whole numbers: right-aligned with the `0` number format in XLSX. */
  readonly numeric?: boolean;
  /** PDF cell alignment; defaults to left. */
  readonly align?: "left" | "right";
};

export type ExportFormat = "csv" | "xlsx" | "pdf";

/** Plain display text for tabular formats that have no null cell type. */
export function displayExportValue(value: ExportValue): string {
  return value === null ? "" : String(value);
}
