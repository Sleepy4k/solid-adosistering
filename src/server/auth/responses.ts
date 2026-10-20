export function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0 && rest > 0) return `${minutes} menit ${rest} detik`;
  if (minutes > 0) return `${minutes} menit`;
  return `${rest} detik`;
}

export function cooldownResponse(retryAfterSec: number) {
  return new Response(`Terlalu banyak percobaan login. Coba lagi dalam ${formatCooldown(retryAfterSec)}.`, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSec) },
  });
}

export function invalidCredentialsResponse(remaining: number) {
  const suffix = remaining > 0 ? ` Sisa ${remaining} percobaan sebelum penguncian sementara.` : "";
  return new Response(`Kredensial tidak valid.${suffix}`, { status: 401 });
}
