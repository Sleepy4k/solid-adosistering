import { z } from "zod";
import { SORT_DIRS } from "~/lib/shared/tableSort";
import {
  emailSchema,
  idSchema,
  nameSchema,
  optionalDateSchema,
  optionalPhoneSchema,
  optionalText,
  roleSchema,
} from "./common";

/** Scope filters shared with the export dataset. */
export const userListFiltersSchema = z.object({
  role: roleSchema.optional(),
  search: z.string().trim().max(100, "Pencarian maksimal 100 karakter.").optional(),
});

/** Full list query: filters + sort + pagination, all resolved server-side. */
export const userListQuerySchema = userListFiltersSchema.extend({
  status: z.enum(["active", "inactive"]).optional(),
  sort: z.object({ key: z.string().max(32), dir: z.enum(SORT_DIRS) }).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
});

export const idInputSchema = z.object({ id: idSchema });

export const setUserActiveSchema = z.object({ id: idSchema, active: z.boolean() });
export const deleteUserSchema = z.object({ id: idSchema });
export const resendSetPasswordLinkSchema = z.object({ id: idSchema });

/** No password: new accounts get a one-time set-password link by email. */
export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  regionIds: z.array(idSchema).max(50, "Terlalu banyak region.").optional(),
  whatsapp: optionalPhoneSchema,
  nickname: optionalText(100),
  gender: optionalText(32),
  birthDate: optionalDateSchema,
  altPhone: optionalPhoneSchema,
  occupation: optionalText(120),
  domicile: optionalText(120),
  address: optionalText(500),
  internalNotes: optionalText(2000),
  deviceUsername: optionalText(100),
});

export const updateUserSchema = z.object({
  id: idSchema,
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  regionIds: z.array(idSchema).max(50, "Terlalu banyak region.").optional(),
  whatsapp: optionalPhoneSchema,
  gender: optionalText(32),
  address: optionalText(500),
  domicile: optionalText(120),
  internalNotes: optionalText(2000),
});

export const updateProfileSchema = z.object({
  name: nameSchema,
  whatsapp: optionalPhoneSchema,
  gender: optionalText(32),
  address: optionalText(500),
  country: optionalText(100),
  province: optionalText(100),
  city: optionalText(100),
  postalCode: optionalText(20),
});
