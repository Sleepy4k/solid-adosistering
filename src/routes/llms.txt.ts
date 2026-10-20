import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";
import { prisma } from "~/server/db/prisma";

type BrandInfo = { projectName: string; tagline: string };

const FALLBACK: BrandInfo = {
  projectName: siteConfig.name,
  tagline: "Sistem Irigasi Cerdas Berbasis IoT untuk Mengoptimalkan Pengairan Lahan Kering",
};

async function getBrand(): Promise<BrandInfo> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "webConfig" } });
    const value = (setting?.value ?? {}) as Partial<BrandInfo>;
    return {
      projectName: value.projectName?.trim() || FALLBACK.projectName,
      tagline: value.tagline?.trim() || FALLBACK.tagline,
    };
  } catch {
    return FALLBACK;
  }
}

export async function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");
  const brand = await getBrand();

  const content = `# ${brand.projectName}

> ${brand.tagline}

${brand.projectName} adalah platform manajemen irigasi tetes cerdas berbasis IoT untuk lahan kering di Indonesia. Platform ini menggabungkan sensor kelembapan tanah, kontrol sprayer dan pompa secara real-time, riwayat irigasi, statistik penggunaan air, serta administrasi region dan pengguna berbasis peran.

Bahasa utama situs: Bahasa Indonesia (id-ID). Halaman dashboard memerlukan autentikasi dan tidak ditujukan untuk pengindeksan otomatis.

## Halaman publik

- [Beranda](${origin}/): ringkasan produk, fitur, studi implementasi, mitra, dan formulir kontak.
- [Login](${origin}/login): akses akun yang diberikan administrator. Tidak diindeks.
- [Lupa Password](${origin}/forgot-password): permintaan tautan reset password. Tidak diindeks.
- [Reset Password](${origin}/reset-password): penyelesaian reset password dengan token sekali pakai. Tidak diindeks.

## Produk dan kemampuan

- Monitoring kelembapan tanah dan status sprayer secara real-time melalui Firebase Realtime Database.
- Kontrol pompa dan mode otomatis/manual dengan pencatatan audit.
- Ambang kelembapan otomatis (kering, lembab, basah) dan safety timeout per region.
- Riwayat irigasi dengan filter tanggal, blok, status, dan mode.
- Statistik tren kelembapan serta estimasi penggunaan air untuk 1 hari, 7 hari, dan 30 hari.
- Manajemen pengguna dan region dengan role SUPERADMIN, ADMIN, dan USER.
- Notifikasi email transaksional dan pengiriman email massal untuk subscriber newsletter.
- Manajemen konten landing page: testimoni, lokasi implementasi, mitra, dan newsletter.

## Teknologi

SolidStart v2, SolidJS, TypeScript, Prisma ORM, MariaDB/MySQL, Firebase Realtime Database, Argon2id, dan Tailwind CSS v4.

## Informasi resmi

- Situs: ${origin}
- Sitemap: ${origin}/sitemap.xml
- Dokumentasi lengkap untuk LLM: ${origin}/llms-full.txt
- Kontak: ${siteConfig.contactEmail}
- Keamanan: ${origin}/.well-known/security.txt
- Lisensi konten: © ${new Date().getFullYear()} ${siteConfig.legalName}. Hak cipta dilindungi.

## Catatan penggunaan

Halaman yang memerlukan login, endpoint server (\`/_server/\`), API internal, dan file unggahan tidak boleh dirayapi. Data sensor dan kontrol perangkat hanya tersedia melalui akun resmi yang diotorisasi.
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
