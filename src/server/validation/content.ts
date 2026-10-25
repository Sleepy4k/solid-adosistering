import { z } from "zod";
import { emailSchema, idSchema, nameSchema, optionalPhoneSchema, optionalText, safeImageUrlSchema } from "./common";

export const contactSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  userType: optionalText(64),
  message: z.string().trim().min(10, "Pesan minimal 10 karakter.").max(2000, "Pesan maksimal 2000 karakter."),
});

/** Free-text search box: trimmed, bounded, empty means "no filter". */
const searchTextSchema = z
  .string()
  .trim()
  .max(100, "Pencarian maksimal 100 karakter.")
  .optional()
  .transform((value) => value || undefined);

/** Raw sort input; the key is checked against a per-endpoint allow-list by resolveSort. */
const sortInputSchema = z.object({ key: z.string().max(40).optional(), dir: z.string().max(8).optional() }).optional();

const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.")
  .optional()
  .or(z.literal("").transform(() => undefined));

const pageNumberSchema = z.number().int().min(0).max(100_000).default(0);
const pageSizeSchema = z.number().int().min(10).max(100).default(25);

export const newsletterSchema = emailSchema;

/**
 * Confirmation tokens are 32 random bytes encoded as base64url. Unsubscribe
 * tokens add a single `.` separator plus a base64url HMAC signature. Keep the
 * pattern anchored and linear-time so hostile input cannot trigger ReDoS.
 */
export const newsletterTokenSchema = z
  .string({ error: "Token tidak valid." })
  .trim()
  .min(20, "Token tidak valid.")
  .max(512, "Token tidak valid.")
  .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/, "Token tidak valid.");

export const newsletterConfirmSchema = z.object({ token: newsletterTokenSchema });
export const newsletterUnsubscribeSchema = z.object({ token: newsletterTokenSchema });
export const newsletterResendSchema = z.object({ id: idSchema });

export const newsletterSubscriberStatusSchema = z.enum(["PENDING", "CONFIRMED", "UNSUBSCRIBED"], {
  error: "Status subscriber tidak valid.",
});

export const subscriberListSchema = z.object({
  page: z
    .number({ error: "Halaman tidak valid." })
    .int("Halaman harus bilangan bulat.")
    .min(0, "Halaman minimal 0.")
    .max(100_000, "Halaman maksimal 100000.")
    .default(0),
  pageSize: z
    .number({ error: "Ukuran halaman tidak valid." })
    .int("Ukuran halaman harus bilangan bulat.")
    .min(10, "Ukuran halaman minimal 10.")
    .max(100, "Ukuran halaman maksimal 100.")
    .default(25),
  status: newsletterSubscriberStatusSchema.optional(),
  search: searchTextSchema,
  sort: sortInputSchema,
});

export const markContactReadSchema = z.object({ id: idSchema, isRead: z.boolean() });
export const contactListSchema = z.object({
  unreadOnly: z.boolean().optional(),
  readState: z.enum(["all", "unread", "read"]).optional(),
  search: searchTextSchema,
  dateFrom: dayStringSchema,
  dateTo: dayStringSchema,
  sort: sortInputSchema,
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000_000).optional(),
});

/** Admin CMS list (testimonials, locations, partners): server-side search, sort and pagination. */
export const cmsListSchema = z.object({
  page: pageNumberSchema,
  pageSize: pageSizeSchema,
  search: searchTextSchema,
  active: z.enum(["all", "active", "inactive"]).optional(),
  sort: sortInputSchema,
});

export const bulkEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subjek wajib diisi.")
    .max(200)
    .refine((value) => !/[\r\n]/.test(value), "Subjek tidak boleh mengandung baris baru."),
  body: z.string().trim().min(1, "Isi pesan wajib diisi.").max(10000),
  cursor: z
    .string({ error: "Cursor tidak valid." })
    .trim()
    .max(128, "Cursor tidak valid.")
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
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
