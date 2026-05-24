const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return "Email wajib diisi.";
  if (v.length > 254) return "Email terlalu panjang.";
  if (!EMAIL_RE.test(v)) return "Format email tidak valid.";
  return "";
}

export function validateRequired(value: string, label = "Kolom ini"): string {
  if (!value.trim()) return `${label} wajib diisi.`;
  return "";
}

export function validateNewPassword(value: string): string {
  if (!value) return "Password wajib diisi.";
  if (value.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  return "";
}

export function validatePasswordConfirm(password: string, confirm: string): string {
  if (!confirm) return "Konfirmasi password wajib diisi.";
  if (password !== confirm) return "Password tidak cocok.";
  return "";
}
