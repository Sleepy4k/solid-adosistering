import { z } from "zod";
import { idSchema, optionalText, percentSchema, safeImageUrlSchema } from "./common";

export const saveThresholdSchema = z.object({
  regionId: idSchema,
  dryMaxPercent: percentSchema,
  wetMinPercent: percentSchema,
  displayDryMaxPercent: percentSchema.optional(),
  displayMoistMaxPercent: percentSchema.optional(),
  displayWetMinPercent: percentSchema.optional(),
  landPreference: z.enum(["KERING", "LEMBAB", "BASAH"]).optional(),
});

export const saveSafetyTimeoutSchema = z.object({
  min: z.number().int().min(1).max(10),
  max: z.number().int().min(1).max(10),
});

export const saveRegionSafetyTimeoutSchema = saveSafetyTimeoutSchema.extend({ regionId: idSchema });

export const webConfigSchema = z.object({
  projectName: z.string().trim().min(1, "Nama proyek wajib diisi.").max(100),
  logoUrl: safeImageUrlSchema,
  iconUrl: safeImageUrlSchema,
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format #RRGGBB."),
  tagline: optionalText(300),
});

export const mapConfigSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  zoom: z.number().int().min(1).max(22),
});

export const mapDisplaySchema = z.object({
  basahColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  keringColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  lembabColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
});
