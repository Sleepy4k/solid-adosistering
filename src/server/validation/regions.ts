import { z } from "zod";
import { firebaseKeySchema, firebaseNameSchema, idSchema, nameSchema, optionalText, percentSchema } from "./common";

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
  areaHectare: optionalText(32),
  description: optionalText(1000),
});

export const updateBlockSchema = z.object({
  id: idSchema,
  name: firebaseNameSchema,
  areaHectare: optionalText(32),
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
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const blockGeometrySchema = z.object({
  blockId: idSchema,
  points: z.array(mapPointSchema).min(3, "Polygon membutuhkan minimal 3 titik koordinat.").max(500),
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

export const statisticsSchema = z.object({
  blockId: idSchema.optional(),
  regionId: idSchema.optional(),
  range: z.enum(["today", "7d", "30d"]),
});
