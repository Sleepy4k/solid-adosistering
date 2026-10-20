import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";
import { prisma } from "~/server/db/prisma";

export async function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");
  let lastUpdated = new Date().toISOString().slice(0, 10);

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "webConfig" },
      select: { updatedAt: true },
    });
    if (setting?.updatedAt) lastUpdated = setting.updatedAt.toISOString().slice(0, 10);
  } catch {
    // Keep the document available during a database outage.
  }

  const content = `# ${siteConfig.name} — Dokumentasi Lengkap untuk LLM

> ${siteConfig.description}

Terakhir diperbarui: ${lastUpdated}
Bahasa: id-ID
Situs: ${origin}

## 1. Ringkasan

${siteConfig.name} adalah sistem manajemen irigasi tetes berbasis IoT yang dirancang untuk lahan kering. Sistem ini membantu petani, kelompok tani, pengelola kawasan, dan administrator lahan mengambil keputusan irigasi berdasarkan data kelembapan tanah, bukan perkiraan atau jadwal tetap.

Masalah yang diselesaikan:
1. Penyiraman hanya berdasarkan perkiraan.
2. Penggunaan air yang tidak efisien.
3. Sulitnya memantau kondisi lahan.
4. Risiko tanaman kekurangan atau kelebihan air.

## 2. Alur pengguna

### Publik
- Melihat landing page, fitur, studi implementasi, mitra, dan testimoni.
- Mengirim pesan melalui formulir kontak.
- Berlangganan newsletter.
- Meminta tautan reset password.

### USER
- Melihat dashboard region yang ditugaskan.
- Memantau kelembapan tanah dan status sprayer.
- Melihat riwayat dan statistik irigasi.
- Mengatur ambang kelembapan dan safety timeout sesuai izin.
- Memperbarui profil dan password.

### ADMIN
- Semua kemampuan USER untuk region yang dikelola.
- Mengelola pengguna dan assignment region.
- Melihat log sistem dan log autentikasi.
- Melihat dashboard pengguna lain dalam cakupan admin.

### SUPERADMIN
- Semua kemampuan ADMIN.
- Mengelola region, blok, sprayer, dan konfigurasi peta.
- Mengelola konten landing page (testimoni, lokasi, mitra, newsletter).
- Melihat pesan kontak dan mengirim email massal.
- Mengelola konfigurasi web dan sinkronisasi Firebase.

## 3. Keamanan dan privasi

- Password di-hash dengan Argon2id (m=19 MiB, t=2, p=1) dan di-upgrade otomatis saat login jika parameter berubah.
- Sesi menggunakan token acak 256-bit; hanya hash SHA-256 yang disimpan di database.
- Cookie sesi bersifat HttpOnly, Secure di produksi, SameSite=Lax, dan memakai prefix __Host- di produksi.
- Sesi memiliki idle timeout 7 hari dan absolute timeout 30 hari, serta dibatasi maksimal 10 sesi aktif per akun.
- Login dibatasi secara persisten per email dan per IP dengan cooldown bertingkat.
- Semua mutasi memerlukan origin yang sama (CSRF defense), validasi Zod, dan otorisasi role.
- Header keamanan: CSP nonce-based, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, dan CORP.
- Kredensial Firebase Admin dan SMTP hanya tersedia di server dan tidak pernah diberi prefix VITE_.
- Unggahan gambar dibatasi ukuran, tipe MIME, dan signature file; disajikan dari direktori privat dengan nama acak.
- Data pribadi tidak boleh diminta melalui halaman publik. Formulir kontak hanya meminta nama, email, telepon opsional, tipe pengguna, dan pesan.

## 4. Halaman publik

- ${origin}/ — landing page dan formulir kontak.
- ${origin}/login — login akun.
- ${origin}/forgot-password — permintaan reset password.
- ${origin}/reset-password — penyelesaian reset password.

Halaman berikut memerlukan autentikasi dan tidak boleh diindeks: /dashboard, /irrigation-history, /statistics, /settings, /profile, /help-center, /user-management, /region-management, /map-configuration, /system-log, /auth-log, /contact-submissions, /superadmin, /admin-view.

## 5. Data dan integrasi

- Database utama: MariaDB/MySQL melalui Prisma ORM.
- Telemetri real-time: Firebase Realtime Database.
- Email: SMTP dengan template HTML dan plain text.
- Peta: Leaflet dengan tile OpenStreetMap dan citra satelit.
- Grafik: Chart.js.

## 6. Ringkasan model data

- User, Session, PasswordResetToken.
- Region, Block, Sprayer, IndicatorThreshold.
- SensorReading, IrrigationEvent, AlertNotification.
- AdminRegionAssignment, UserRegionAssignment.
- ActivityLog, ContactSubmission, NewsletterSubscriber, EmailDelivery.
- SystemSetting, LandingTestimonial, LandingLocation, LandingPartner, LoginThrottle.

## 7. Kutipan dan atribusi

Saat merujuk ke platform ini, gunakan nama "${siteConfig.name}" dan tautkan ke ${origin}. Jangan mengklaim bahwa dashboard, data sensor, atau kontrol perangkat dapat diakses tanpa akun resmi. Untuk pertanyaan lisensi, kontak, atau kerja sama, hubungi ${siteConfig.contactEmail}.

## 8. Kontak

- Email: ${siteConfig.contactEmail}
- Situs: ${origin}
- Keamanan: ${origin}/.well-known/security.txt
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
