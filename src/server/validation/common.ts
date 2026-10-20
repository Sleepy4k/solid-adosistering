import "server-only";
import { z } from "zod";
import { isSafeImageUrl } from "../auth/security";

export const COMMON_PASSWORDS = new Set([
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

export const indonesianMessages = {
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

/**
 * Firebase RTDB forbids `. # $ / [ ]` in path segments and rejects ASCII control
 * characters. Checked with a character scan instead of a control-character regex
 * to keep the validator linear-time and free of ReDoS-prone patterns.
 */
function hasUnsafeFirebaseChars(value: string): boolean {
  if (/[.#$\/\[\]]/.test(value)) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

const FIREBASE_NAME_ERROR = "Nama tidak boleh mengandung karakter . # $ / [ ] atau karakter kontrol.";
const FIREBASE_KEY_ERROR = "Hardware ID tidak boleh mengandung karakter . # $ / [ ] atau karakter kontrol.";

/** Region/block names double as Firebase RTDB path segments, so reject reserved keys. */
export const firebaseNameSchema = nameSchema.refine((value) => !hasUnsafeFirebaseChars(value), FIREBASE_NAME_ERROR);

/** Hardware IDs are used as RTDB keys under a block; they must be safe path segments. */
export const firebaseKeySchema = z
  .string({ error: indonesianMessages.required })
  .trim()
  .min(1, "Hardware ID wajib diisi.")
  .max(100, "Hardware ID maksimal 100 karakter.")
  .refine((value) => !hasUnsafeFirebaseChars(value), FIREBASE_KEY_ERROR);

export const optionalText = (max: number) =>
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

/** Parse input or throw a plain-text 400 Response (matches the app's action error contract). */
export function parseInput<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Data yang dikirim tidak valid.";
    throw new Response(message, { status: 400 });
  }
  return result.data;
}
