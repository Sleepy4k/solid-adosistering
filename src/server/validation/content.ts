import { z } from "zod";
import { emailSchema, idSchema, nameSchema, optionalPhoneSchema, optionalText, safeImageUrlSchema } from "./common";

export const contactSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  userType: optionalText(64),
  message: z.string().trim().min(10, "Pesan minimal 10 karakter.").max(2000, "Pesan maksimal 2000 karakter."),
});

export const newsletterSchema = emailSchema;

export const markContactReadSchema = z.object({ id: idSchema, isRead: z.boolean() });
export const contactListSchema = z.object({ unreadOnly: z.boolean().optional() });

export const bulkEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subjek wajib diisi.")
    .max(200)
    .refine((value) => !/[\r\n]/.test(value), "Subjek tidak boleh mengandung baris baru."),
  body: z.string().trim().min(1, "Isi pesan wajib diisi.").max(10000),
});

export const landingTestimonialSchema = z.object({
  id: idSchema.optional(),
  name: nameSchema,
  role: z.string().trim().min(1, "Peran wajib diisi.").max(120),
  quote: z.string().trim().min(10, "Kutipan minimal 10 karakter.").max(2000),
  imageUrl: safeImageUrlSchema,
  sortOrder: z.number().int().min(-10000).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const landingLocationSchema = z.object({
  id: idSchema.optional(),
  name: nameSchema,
  description: z.string().trim().min(10, "Deskripsi minimal 10 karakter.").max(2000),
  imageUrl: safeImageUrlSchema,
  sortOrder: z.number().int().min(-10000).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const landingPartnerSchema = z.object({
  id: idSchema.optional(),
  name: nameSchema,
  logoUrl: safeImageUrlSchema,
  websiteUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || /^https?:\/\//i.test(value), "URL website tidak valid.")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  sortOrder: z.number().int().min(-10000).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const activityLogFiltersSchema = z.object({
  action: z
    .enum([
      "AUTH_LOGIN",
      "AUTH_LOGOUT",
      "AUTH_PASSWORD_RESET_REQUEST",
      "AUTH_PASSWORD_RESET_COMPLETE",
      "CREATE",
      "UPDATE",
      "DELETE",
      "ASSIGN",
      "UNASSIGN",
      "CONTROL_OVERRIDE",
      "FIREBASE_SYNC",
      "ALERT_SENT",
    ])
    .optional(),
  category: z.enum(["auth", "system"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100000).optional(),
});
