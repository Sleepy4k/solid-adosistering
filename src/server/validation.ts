import "server-only";
import { z } from "zod";
import { isSafeImageUrl } from "./security";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "password123!",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein",
  "admin123",
  "admin123!",
  "welcome123",
  "iloveyou",
  "abc12345",
  "changeme",
]);

const indonesianMessages = {
  required: "Kolom ini wajib diisi.",
  email: "Format email tidak valid.",
  password: "Password minimal 8 karakter.",
  passwordMax: "Password maksimal 128 karakter.",
  passwordCommon: "Password terlalu umum. Gunakan kombinasi yang lebih unik.",
  name: "Nama minimal 2 karakter.",
  nameMax: "Nama maksimal 100 karakter.",
};

export const emailSchema = z
  .string({ error: indonesianMessages.required })
  .trim()
  .min(1, indonesianMessages.required)
  .max(254, "Email terlalu panjang.")
  .email(indonesianMessages.email)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ error: indonesianMessages.required })
  .min(8, indonesianMessages.password)
  .max(128, indonesianMessages.passwordMax)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), indonesianMessages.passwordCommon);

export const nameSchema = z
  .string({ error: indonesianMessages.required })
  .trim()
  .min(2, indonesianMessages.name)
  .max(100, indonesianMessages.nameMax);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

export const optionalPhoneSchema = optionalText(32).refine(
  (value) => !value || /^\+?[\d\s\-().]{9,32}$/.test(value),
  "Nomor telepon tidak valid.",
);

export const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus yyyy-mm-dd.")
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

export const roleSchema = z.enum(["SUPERADMIN", "ADMIN", "USER"], { error: "Role tidak valid." });

export const idSchema = z
  .string({ error: "ID tidak valid." })
  .trim()
  .min(1, "ID tidak valid.")
  .max(128, "ID tidak valid.")
  .regex(/^[a-zA-Z0-9_-]+$/, "ID tidak valid.");

export const safeImageUrlSchema = z
  .string()
  .trim()
  .max(2048, "URL terlalu panjang.")
  .refine((value) => !value || isSafeImageUrl(value), "URL gambar tidak valid.")
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

export const percentSchema = z
  .number({ error: "Nilai persentase tidak valid." })
  .int("Nilai persentase harus bilangan bulat.")
  .min(0, "Nilai minimal 0.")
  .max(100, "Nilai maksimal 100.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi.").max(128, indonesianMessages.passwordMax),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const completePasswordResetSchema = z.object({
  token: z.string().trim().min(20, "Token tidak valid.").max(256, "Token tidak valid."),
  newPassword: passwordSchema,
});

export const userListFiltersSchema = z.object({
  role: roleSchema.optional(),
  search: z.string().trim().max(100, "Pencarian maksimal 100 karakter.").optional(),
});

export const idInputSchema = z.object({ id: idSchema });

export const setUserActiveSchema = z.object({ id: idSchema, active: z.boolean() });
export const deleteUserSchema = z.object({ id: idSchema });

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
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

export const coordinateSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((value) => (value === null || value === undefined ? undefined : String(value)));

export const createRegionSchema = z.object({
  name: nameSchema,
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
  name: nameSchema,
  areaHectare: optionalText(32),
  description: optionalText(1000),
});

export const updateBlockSchema = z.object({
  id: idSchema,
  name: nameSchema,
  areaHectare: optionalText(32),
});

export const createSprayerSchema = z.object({
  blockId: idSchema,
  hardwareId: z.string().trim().min(1, "Hardware ID wajib diisi.").max(100),
  displayName: nameSchema,
  dryMaxPercent: percentSchema,
  wetMinPercent: percentSchema,
});

export const overridePumpSchema = z.object({
  sprayerId: idSchema,
  mode: z.enum(["AUTO", "MANUAL"]),
  relay: z.enum(["OFF", "ON"]),
});

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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi.").max(128),
  newPassword: passwordSchema,
});

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

export const mapPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const blockGeometrySchema = z.object({
  blockId: idSchema,
  points: z.array(mapPointSchema).min(3, "Polygon membutuhkan minimal 3 titik koordinat.").max(500),
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
  cursor: idSchema.optional(),
  limit: z.number().int().min(1).max(85).optional(),
});

export const statisticsSchema = z.object({
  blockId: idSchema.optional(),
  regionId: idSchema.optional(),
  range: z.enum(["today", "7d", "30d"]),
});

/** Parse input or throw a plain-text 400 Response (matches the app's action error contract). */
export function parseInput<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Data yang dikirim tidak valid.";
    throw new Response(message, { status: 400 });
  }
  return result.data;
}
