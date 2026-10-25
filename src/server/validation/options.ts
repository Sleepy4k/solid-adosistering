import { z } from "zod";
import { idSchema } from "./common";

const optionShape = {
  query: z.string().trim().max(100, "Pencarian maksimal 100 karakter.").default(""),
  limit: z.number().int().min(1).max(50).default(20),
};

export const regionOptionsSchema = z.object(optionShape);

export const blockOptionsSchema = z.object({
  ...optionShape,
  regionId: idSchema.optional(),
});

export const adminOptionsSchema = z.object({
  ...optionShape,
  excludeRegionId: idSchema.optional(),
});
