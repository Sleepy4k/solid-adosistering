/**
 * Pure date/time helpers for Asia/Jakarta (WIB, UTC+7, no DST).
 *
 * Shared by statistics, history export, and dashboard timestamps. This module is
 * dependency-free and safe on both the client and the server. It never relies on
 * the host local time zone: WIB is modeled as a fixed +07:00 offset, so results
 * are identical in every runtime environment.
 */

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/;

const MIN_MONTH_YEAR = 1900;
const MAX_MONTH_YEAR = 2100;

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

type CalendarMonth = {
  readonly year: number;
  readonly month: number;
};

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** UTC midnight for calendar parts; `month` is 1-based and may roll over. */
function utcMidnightMs(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/** Strict calendar parse: rejects impossible dates such as 2026-02-31. */
function parseDateOnly(value: string): CalendarDate | null {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(utcMidnightMs(year, month, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

function parseMonth(value: string): CalendarMonth | null {
  const match = MONTH_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || year < MIN_MONTH_YEAR || year > MAX_MONTH_YEAR) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return { year, month };
}

/**
 * Resolve a `Date` or date string to an epoch instant.
 * Date-only strings are validated strictly so invalid calendar dates are not
 * silently normalized by the host parser.
 */
function toInstant(value: Date | string): number {
  if (value instanceof Date) return value.getTime();

  const raw = value.trim();
  if (!raw) return Number.NaN;

  const prefix = DATE_PREFIX_RE.exec(raw);
  if (prefix) {
    const datePart = prefix[1] ?? "";
    if (!isValidDateOnly(datePart)) return Number.NaN;
  }

  return Date.parse(raw);
}

/** A `Date` shifted into WIB so UTC getters read Jakarta wall-clock fields. */
function shiftedToJakarta(value: Date | string): Date | null {
  const instant = toInstant(value);
  if (!Number.isFinite(instant)) return null;
  return new Date(instant + JAKARTA_OFFSET_MS);
}

/** Strict `YYYY-MM-DD` check against the real proleptic Gregorian calendar. */
export function isValidDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null;
}

/** Strict `YYYY-MM` check with month 01-12 and year 1900-2100. */
export function isValidMonth(value: string): boolean {
  return parseMonth(value) !== null;
}

/**
 * Start of the WIB calendar day as a UTC instant.
 * @throws RangeError when `date` is not a valid `YYYY-MM-DD` date.
 */
export function startOfJakartaDay(date: string): Date {
  const parts = parseDateOnly(date);
  if (!parts) throw new RangeError(`Tanggal tidak valid: ${date}`);
  return new Date(utcMidnightMs(parts.year, parts.month, parts.day) - JAKARTA_OFFSET_MS);
}

/** Exclusive end of the WIB calendar day: exactly start + 24h. */
export function endOfJakartaDayExclusive(date: string): Date {
  return new Date(startOfJakartaDay(date).getTime() + DAY_MS);
}

/**
 * First day of the WIB month at 00:00 as a UTC instant.
 * @throws RangeError when `month` is not a valid `YYYY-MM` month.
 */
export function startOfJakartaMonth(month: string): Date {
  const parts = parseMonth(month);
  if (!parts) throw new RangeError(`Bulan tidak valid: ${month}`);
  return new Date(utcMidnightMs(parts.year, parts.month, 1) - JAKARTA_OFFSET_MS);
}

/** First day of the following WIB month at 00:00 as a UTC instant. */
export function startOfNextJakartaMonth(month: string): Date {
  const parts = parseMonth(month);
  if (!parts) throw new RangeError(`Bulan tidak valid: ${month}`);
  return new Date(utcMidnightMs(parts.year, parts.month + 1, 1) - JAKARTA_OFFSET_MS);
}

/**
 * Add fixed 24-hour days to an instant. WIB has no DST, so a day is always 24h.
 * @throws RangeError when the input date or the day count is not finite.
 */
export function addJakartaDays(value: Date, days: number): Date {
  const instant = value.getTime();
  if (!Number.isFinite(instant)) throw new RangeError("Tanggal tidak valid.");
  if (!Number.isFinite(days)) throw new RangeError("Jumlah hari harus berupa angka finite.");

  const result = instant + days * DAY_MS;
  if (!Number.isFinite(result)) throw new RangeError("Hasil penambahan hari di luar jangkauan.");

  return new Date(result);
}

/** `YYYY-MM-DD` calendar key in WIB, or `"-"` for an invalid value. */
export function jakartaDateKey(value: Date | string): string {
  const shifted = shiftedToJakarta(value);
  if (!shifted) return "-";

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();

  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM` calendar key in WIB, or `"-"` for an invalid value. */
export function jakartaMonthKey(value: Date | string): string {
  const shifted = shiftedToJakarta(value);
  if (!shifted) return "-";

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;

  return `${pad(year, 4)}-${pad(month)}`;
}

/** Wall-clock hour (0-23) in WIB, or `NaN` for an invalid value. */
export function jakartaHour(value: Date | string): number {
  const shifted = shiftedToJakarta(value);
  if (!shifted) return Number.NaN;
  return shifted.getUTCHours();
}

/** `Selasa, 20/10/2026`; returns `"-"` for an invalid value. */
export function formatJakartaDate(value: Date | string): string {
  const shifted = shiftedToJakarta(value);
  if (!shifted) return "-";

  const weekday = HARI[shifted.getUTCDay()] ?? "-";
  const day = pad(shifted.getUTCDate());
  const month = pad(shifted.getUTCMonth() + 1);
  const year = pad(shifted.getUTCFullYear(), 4);

  return `${weekday}, ${day}/${month}/${year}`;
}

/** `Selasa, 20/10/2026 17:00 WIB`; returns `"-"` for an invalid value. */
export function formatJakartaDateTime(value: Date | string): string {
  const shifted = shiftedToJakarta(value);
  if (!shifted) return "-";

  const weekday = HARI[shifted.getUTCDay()] ?? "-";
  const day = pad(shifted.getUTCDate());
  const month = pad(shifted.getUTCMonth() + 1);
  const year = pad(shifted.getUTCFullYear(), 4);
  const hour = pad(shifted.getUTCHours());
  const minute = pad(shifted.getUTCMinutes());

  return `${weekday}, ${day}/${month}/${year} ${hour}:${minute} WIB`;
}

/** `Januari 2026`; returns `"-"` for an invalid month key. */
export function formatJakartaMonthLabel(month: string): string {
  const parts = parseMonth(month);
  if (!parts) return "-";

  const label = BULAN[parts.month - 1] ?? "-";
  return `${label} ${parts.year}`;
}

/** Current `YYYY-MM` key in WIB. */
export function currentJakartaMonth(): string {
  return jakartaMonthKey(new Date());
}

/** Current four-digit year in WIB. */
export function currentJakartaYear(): number {
  return Number(jakartaMonthKey(new Date()).slice(0, 4));
}

/**
 * Order two strict `YYYY-MM` month keys as WIB calendar months.
 * Returns a negative/zero/positive number like `Array#sort`, or `NaN` when
 * either key is not a valid month.
 */
export function compareJakartaMonth(a: string, b: string): number {
  const left = parseMonth(a);
  const right = parseMonth(b);
  if (!left || !right) return Number.NaN;

  return left.year - right.year || left.month - right.month;
}

/**
 * True when `month` is a valid `YYYY-MM` key later than the current WIB month.
 * Invalid keys return `false` so callers keep their own format validation.
 */
export function isFutureJakartaMonth(month: string): boolean {
  const comparison = compareJakartaMonth(month, currentJakartaMonth());
  return Number.isFinite(comparison) && comparison > 0;
}

/**
 * Inclusive number of WIB calendar days from `dateFrom` to `dateTo`.
 * Returns `NaN` when either bound is invalid or the range is reversed.
 */
export function inclusiveJakartaDayCount(dateFrom: string, dateTo: string): number {
  const from = parseDateOnly(dateFrom);
  const to = parseDateOnly(dateTo);
  if (!from || !to) return Number.NaN;

  const fromMs = utcMidnightMs(from.year, from.month, from.day);
  const toMs = utcMidnightMs(to.year, to.month, to.day);
  if (toMs < fromMs) return Number.NaN;

  return (toMs - fromMs) / DAY_MS + 1;
}
