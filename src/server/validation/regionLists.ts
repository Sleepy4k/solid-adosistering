import { z } from "zod";
import { ADMIN_ACCOUNT_FILTERS, SYNC_STATUS_FILTERS } from "~/lib/shared/regionTable";
import { idSchema } from "./common";

const sortSchema = z.object({ key: z.string().max(40), dir: z.string().max(4) }).optional();

const pagedShape = {
  search: z.string().trim().max(100, "Pencarian maksimal 100 karakter.").optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
  sort: sortSchema,
};

export const regionListQuerySchema = z.object({
  ...pagedShape,
  syncStatus: z.enum(SYNC_STATUS_FILTERS).optional(),
  automaticMode: z.enum(["on", "off"]).optional(),
});

export const regionConfigQuerySchema = z.object(pagedShape);
export const regionSummaryQuerySchema = z.object({
  ...pagedShape,
  syncStatus: z.enum(SYNC_STATUS_FILTERS).optional(),
});

export const adminUserQuerySchema = z.object({
  ...pagedShape,
  regionId: idSchema.optional(),
  account: z.enum(ADMIN_ACCOUNT_FILTERS).optional(),
});
