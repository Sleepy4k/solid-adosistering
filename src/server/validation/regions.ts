import { z } from "zod";
import { inclusiveJakartaDayCount, isValidDateOnly } from "~/lib/shared/datetime";
import {
  hasDuplicateVertices,
  POLYGON_MAX_POINTS,
  POLYGON_MIN_AREA_DEGREES2,
  polygonAreaDegrees2,
} from "~/lib/shared/polygon";
import { firebaseKeySchema, firebaseNameSchema, idSchema, nameSchema, optionalText, percentSchema } from "./common";

const MAX_AREA_HECTARE = 99_999_999.99;

/**
 * Accept a comma decimal separator (`12,5`) but keep the canonical form with a
 * dot. Leading/trailing dots are expanded (`0.5`, `5`) so both editor habits
 * round-trip, while exponents and unit suffixes remain invalid.
 */
function normalizeAreaText(raw: string): string {
  let text = raw.trim().replace(",", ".");
  if (text.startsWith(".")) text = `0${text}`;
  if (text.endsWith(".")) text = text.slice(0, -1);
  return text;
}

export const areaHectareSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }
    return value;
  },
  z
    .string({ error: "Luas area harus berupa angka." })
    .transform(normalizeAreaText)
    .refine(
      (value) => /^-?\d+(?:\.\d{1,2})?$/.test(value),
      "Luas area harus berupa angka dengan maksimal 2 angka desimal.",
    )
    .refine((value) => Number(value) > 0, "Luas area harus lebih besar dari 0.")
    .refine((value) => Number(value) <= MAX_AREA_HECTARE, "Luas area maksimal 99.999.999,99 hektare.")
    .optional(),
);

export const coordinateSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((value) => (value === null || value === undefined ? undefined : String(value)));

export const createRegionSchema = z.object({
  name: firebaseNameSchema,
  description: optionalText(1000),
  latitude: coordinateSchema,
  longitude: coordinateSchema,
});

export const updateRegionSchema = createRegionSchema.extend({ id: idSchema });

export const assignAdminSchema = z.object({ adminId: idSchema, regionId: idSchema });

export const updateRegionConfigSchema = z.object({
  id: idSchema,
  volumeDivider: z.number().positive("Volume divider harus berupa angka positif.").max(100000),
  showWindDirection: z.boolean(),
  showAutoIrrigation: z.boolean(),
});

export const createBlockSchema = z.object({
  regionId: idSchema,
  name: firebaseNameSchema,
  areaHectare: areaHectareSchema,
});

export const updateBlockSchema = z.object({
  id: idSchema,
  name: firebaseNameSchema,
  areaHectare: areaHectareSchema,
});

export const createSprayerSchema = z.object({
  blockId: idSchema,
  hardwareId: firebaseKeySchema,
  displayName: nameSchema,
  dryMaxPercent: percentSchema,
  wetMinPercent: percentSchema,
});

export const overridePumpSchema = z.object({
  sprayerId: idSchema,
  mode: z.enum(["AUTO", "MANUAL"]),
  relay: z.enum(["OFF", "ON"]),
});

export const mapPointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export const blockGeometrySchema = z
  .object({
    blockId: idSchema,
    points: z
      .array(mapPointSchema)
      .min(3, "Polygon membutuhkan minimal 3 titik koordinat.")
      .max(POLYGON_MAX_POINTS, `Polygon maksimal ${POLYGON_MAX_POINTS} titik koordinat.`),
  })
  .refine((data) => !hasDuplicateVertices(data.points), {
    message: "Polygon memiliki titik koordinat duplikat.",
    path: ["points"],
  })
  .refine((data) => polygonAreaDegrees2(data.points) > POLYGON_MIN_AREA_DEGREES2, {
    message: "Polygon tidak memiliki luas yang valid (titik-titik segaris).",
    path: ["points"],
  });

export const historyFiltersSchema = z.object({
  blockId: idSchema.optional(),
  regionId: idSchema.optional(),
  status: z.enum(["ON", "OFF"]).optional(),
  mode: z.enum(["AUTO", "MANUAL"]).optional(),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.")
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.")
    .optional(),
  cursor: z.string().trim().max(256).optional(),
  limit: z.number().int().min(1).max(85).optional(),
});

const statisticsDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.")
  .refine((value) => isValidDateOnly(value), "Tanggal tidak valid.")
  .optional();

const MAX_STATISTICS_RANGE_DAYS = 31;

export const statisticsSchema = z
  .object({
    blockId: idSchema.optional(),
    regionId: idSchema.optional(),
    range: z.enum(["today", "7d", "30d"]).optional(),
    dateFrom: statisticsDateSchema,
    dateTo: statisticsDateSchema,
  })
  .refine((data) => Boolean(data.dateFrom) === Boolean(data.dateTo), {
    message: "Tanggal awal dan tanggal akhir harus diisi bersama.",
    path: ["dateFrom"],
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: "Tanggal awal tidak boleh melewati tanggal akhir.",
    path: ["dateTo"],
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      const days = inclusiveJakartaDayCount(data.dateFrom, data.dateTo);
      return Number.isFinite(days) && days <= MAX_STATISTICS_RANGE_DAYS;
    },
    { message: `Rentang tanggal maksimal ${MAX_STATISTICS_RANGE_DAYS} hari.`, path: ["dateTo"] },
  )
  .refine((data) => Boolean(data.dateFrom) || Boolean(data.range), {
    message: "Pilih rentang statistik.",
    path: ["range"],
  });
