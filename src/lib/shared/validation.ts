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

export function validateName(value: string, label = "Nama"): string {
  const v = value.trim();
  if (!v) return `${label} wajib diisi.`;
  if (v.length < 2) return `${label} minimal 2 karakter.`;
  if (v.length > 100) return `${label} maksimal 100 karakter.`;
  return "";
}

export function validatePhone(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const digits = v.replace(/[\s\-().+]/g, "");
  if (!/^\d+$/.test(digits)) return "Nomor telepon tidak valid.";
  if (digits.length < 9) return "Nomor telepon terlalu pendek (min 9 digit).";
  if (digits.length > 15) return "Nomor telepon terlalu panjang (maks 15 digit).";
  return "";
}

export function validateMessage(value: string, label = "Pesan"): string {
  const v = value.trim();
  if (!v) return `${label} wajib diisi.`;
  if (v.length < 10) return `${label} minimal 10 karakter.`;
  if (v.length > 2000) return `${label} maksimal 2000 karakter.`;
  return "";
}
