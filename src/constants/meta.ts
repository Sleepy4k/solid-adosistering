import { ROUTES } from "./routes";

export const PAGE_META = {
  home: {
    title: "Beranda",
    description:
      "Dashboard monitoring irigasi tetes Adosistering untuk melihat region, block, kelembapan tanah, penggunaan air, dan kontrol sprayer IoT secara realtime.",
    path: ROUTES.home,
    keywords: "dashboard irigasi iot, monitoring sprayer, adosistering, irigasi tetes",
  },
  login: {
    title: "Login Akun",
    description:
      "Masuk ke dashboard Adosistering untuk mengelola irigasi tetes IoT, data region, block, dan kontrol sprayer.",
    path: ROUTES.login,
    keywords: "login adosistering, dashboard irigasi, sistem irigasi iot",
  },
  forgotPassword: {
    title: "Lupa Password",
    description: "Kirim tautan reset password akun Adosistering ke email yang terdaftar secara aman.",
    path: ROUTES.forgotPassword,
    keywords: "lupa password adosistering, reset password, akun irigasi iot",
  },
  resetPassword: {
    title: "Reset Password",
    description: "Buat password baru untuk akun Adosistering menggunakan token reset yang valid.",
    path: ROUTES.resetPassword,
    keywords: "reset password adosistering, keamanan akun, password baru",
  },
  irrigationHistory: {
    title: "Riwayat Irigasi",
    description:
      "Pantau riwayat aktivitas irigasi berdasarkan tanggal, block, sprayer, status penyiraman, mode kontrol, dan penggunaan air.",
    path: ROUTES.irrigationHistory,
    keywords: "riwayat irigasi, histori penyiraman, data sprayer, penggunaan air",
  },
  statistics: {
    title: "Statistik",
    description:
      "Analisis grafik kelembapan tanah, tren penggunaan air, dan aktivitas irigasi Adosistering dalam rentang waktu harian, 7 hari, dan 30 hari.",
    path: ROUTES.statistics,
    keywords: "statistik irigasi, grafik kelembapan tanah, penggunaan air, telemetry iot",
  },
  settings: {
    title: "Pengaturan",
    description:
      "Atur region, batas kelembapan penyiraman otomatis, preferensi kondisi lahan, dan safety timeout sprayer untuk akun pengguna.",
    path: ROUTES.settings,
    keywords: "pengaturan irigasi, threshold kelembapan, safety timeout, preferensi lahan",
  },
  profile: {
    title: "Profil",
    description: "Kelola informasi profil, kontak, alamat, dan keamanan password akun Adosistering.",
    path: ROUTES.profile,
    keywords: "profil pengguna, akun adosistering, keamanan akun",
  },
  helpCenter: {
    title: "Pusat Bantuan",
    description:
      "Baca FAQ dan panduan penggunaan dashboard Adosistering untuk user, admin, dan superadmin sesuai hak akses.",
    path: ROUTES.helpCenter,
    keywords: "pusat bantuan adosistering, faq irigasi iot, panduan dashboard",
  },
  userManagement: {
    title: "Manajemen User",
    description:
      "Kelola akun pengguna, role, status, profil, dan assignment region sesuai hak akses admin atau superadmin.",
    path: ROUTES.userManagement,
    keywords: "manajemen user, role admin, assignment region, pengguna adosistering",
  },
  userCreate: {
    title: "Tambah User",
    description:
      "Buat akun pengguna baru dengan data profil, role, kredensial awal, dan assignment region yang tervalidasi.",
    path: ROUTES.userCreate,
    keywords: "tambah user, buat akun, assignment region, admin adosistering",
  },
  regionManagement: {
    title: "Manajemen Region",
    description:
      "Kelola data region irigasi, lokasi, status operasional, block, dan sinkronisasi struktur region ke Firebase RTDB.",
    path: ROUTES.regionManagement,
    keywords: "manajemen region, wilayah irigasi, firebase rtdb, block irigasi",
  },
  mapConfiguration: {
    title: "Konfigurasi Peta",
    description:
      "Atur koordinat pusat peta, marker, dan polygon block untuk memvisualisasikan kondisi lahan per region.",
    path: ROUTES.mapConfiguration,
    keywords: "konfigurasi peta, polygon block, leaflet map, koordinat irigasi",
  },
  systemLog: {
    title: "Log Sistem",
    description:
      "Lihat audit log aktivitas sistem, perubahan data penting, dan riwayat aksi administratif Adosistering.",
    path: ROUTES.systemLog,
    keywords: "log sistem, audit log, aktivitas admin, keamanan sistem",
  },
  authLog: {
    title: "Log Autentikasi",
    description: "Lihat riwayat login, logout, dan reset password akun Adosistering.",
    path: ROUTES.authLog,
    keywords: "log autentikasi, login, logout, reset password, keamanan akun",
  },
  contactSubmissions: {
    title: "Pesan Masuk",
    description: "Kelola pesan masuk dari formulir kontak landing page Adosistering.",
    path: ROUTES.contactSubmissions,
    keywords: "pesan masuk, contact us, landing page, adosistering",
  },
  cmsTestimonials: {
    title: "CMS Testimoni",
    description: "Kelola konten testimoni landing page Adosistering.",
    path: ROUTES.cmsTestimonials,
    keywords: "cms testimoni, landing page, adosistering",
  },
  cmsLocations: {
    title: "CMS Lokasi",
    description: "Kelola konten lokasi implementasi landing page Adosistering.",
    path: ROUTES.cmsLocations,
    keywords: "cms lokasi implementasi, landing page, adosistering",
  },
  cmsPartners: {
    title: "CMS Mitra",
    description: "Kelola konten mitra landing page Adosistering.",
    path: ROUTES.cmsPartners,
    keywords: "cms mitra, landing page, adosistering",
  },
  cmsSubscribers: {
    title: "Newsletter",
    description: "Kelola subscriber newsletter dan kirim bulk email Adosistering.",
    path: ROUTES.cmsSubscribers,
    keywords: "newsletter, subscriber, bulk email, adosistering",
  },
  notFound: {
    title: "404",
    description: "Halaman yang diminta tidak tersedia atau sudah dipindahkan di aplikasi Adosistering.",
    path: "/404",
    keywords: "halaman tidak ditemukan, 404 adosistering",
  },
} as const;

export type PageMetaKey = keyof typeof PAGE_META;
