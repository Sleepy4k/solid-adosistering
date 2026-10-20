import { z } from "zod";
import { emailSchema, indonesianMessages, passwordSchema } from "./common";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi.").max(128, indonesianMessages.passwordMax),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const completePasswordResetSchema = z.object({
  token: z.string().trim().min(20, "Token tidak valid.").max(256, "Token tidak valid."),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi.").max(128),
  newPassword: passwordSchema,
});
