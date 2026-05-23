import type { ActivityAction } from "@prisma/client";

export const ACTION_LABELS: Partial<Record<ActivityAction, string>> = {
  AUTH_LOGIN: "Login",
  AUTH_LOGOUT: "Logout",
  AUTH_PASSWORD_RESET_REQUEST: "Reset PW (Request)",
  AUTH_PASSWORD_RESET_COMPLETE: "Reset PW (Selesai)",
  CREATE: "Buat",
  UPDATE: "Perbarui",
  DELETE: "Hapus",
  ASSIGN: "Tugaskan",
  UNASSIGN: "Lepas Tugas",
  CONTROL_OVERRIDE: "Kontrol Manual",
  FIREBASE_SYNC: "Sync Firebase",
};

export const ACTION_COLORS: Partial<Record<ActivityAction, string>> = {
  AUTH_LOGIN: "bg-sky-100 text-sky-700",
  AUTH_LOGOUT: "bg-slate-100 text-slate-600",
  AUTH_PASSWORD_RESET_REQUEST: "bg-indigo-100 text-indigo-700",
  AUTH_PASSWORD_RESET_COMPLETE: "bg-indigo-100 text-indigo-700",
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
  ASSIGN: "bg-violet-100 text-violet-700",
  UNASSIGN: "bg-orange-100 text-orange-700",
  CONTROL_OVERRIDE: "bg-blue-100 text-blue-700",
};

export const AUTH_ACTIONS = [
  "AUTH_LOGIN",
  "AUTH_LOGOUT",
  "AUTH_PASSWORD_RESET_REQUEST",
  "AUTH_PASSWORD_RESET_COMPLETE",
] as ActivityAction[];
