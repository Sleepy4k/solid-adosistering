import type { WebConfig } from "~/server/actions/index";

export const DEFAULT_WEB_CONFIG: WebConfig = {
  projectName: "Adosistering",
  logoUrl: null,
  primaryColor: "#67B744",
  tagline: "Sistem Irigasi Cerdas Berbasis IoT untuk Mengoptimalkan Pengairan Lahan Kering",
};

export const NAV_LINKS = [
  { href: "#beranda", label: "Beranda" },
  { href: "#fitur", label: "Fitur" },
  { href: "#implementasi", label: "Implementasi" },
  { href: "#mitra-kami", label: "Mitra Kami" },
] as const;

export const PROBLEMS = [
  {
    title: "Penyiraman Dilakukan Hanya Berdasarkan Perkiraan",
    desc: "Padahal, setiap tanaman membutuhkan jumlah air yang dan frekuensi irigasi yang berbeda.",
    img: "/landing/problem-feature-1.png",
    alt: "Petani menyiram tanaman berdasarkan perkiraan",
  },
  {
    title: "Penggunaan Air Tidak Efisien",
    desc: "Irigasi yang dilakukan hanya berdasarkan perkiraan, mengakibatkan penggunaan air yang tidak efisien.",
    img: "/landing/problem-feature-2.png",
    alt: "Sistem irigasi konvensional berbasis jadwal tetap",
  },
  {
    title: "Sulitnya Memantau Kondisi Lahan",
    desc: "Belum ada parameter yang dapat mengukur kondisi lahan supaya irigasi dapat lebih optimal.",
    img: "/landing/problem-feature-3.png",
    alt: "Kesulitan memantau kondisi lahan pertanian",
  },
  {
    title: "Risiko Tanaman Mengalami Kekurangan atau Kelebihan Air",
    desc: "Tanaman yang mengalami kekurangan atau kelebihan air, tentunya akan berdampak pada hasil panen.",
    img: "/landing/problem-feature-4.png",
    alt: "Penyiraman manual yang tidak efisien",
  },
] as const;

export const TESTIMONIALS = [
  {
    name: "Sukirno",
    role: "Sekretaris Desa Dawuhan, Banyumas",
    quote:
      "Keterbatasan air tetap menjadi masalah petani di Desa Dawuhan. Selain itu, irigasi menggunakan pompa berbahan bakar fosil sangat boros terutama bagi petani",
    img: "/landing/profile-sukirno.png",
  },
  {
    name: "Muchtarom",
    role: "Ketua Harja Tani, KedungBenda",
    quote:
      "Setiap musim kemarau, persediaan air pasti habis. Sebagai petani kita harus bisa irigasi dengan jumlah air yang sedikit",
    img: "/landing/profile-muctharom.png",
  },
  {
    name: "Suyitno",
    role: "Pengelola Kawista Emji Mernek, Cilacap",
    quote:
      "Beberapa hari sekali, petani harus menyiram pupuk ke lahan. Aktivitas ini sangat memakan waktu dan tenaga. Kami harap ada solusi yang lebih efektif",
    img: "/landing/profile-suyitno.png",
  },
] as const;

export const SOLUTION_HIGHLIGHTS = [
  {
    icon: "/landing/water.svg",
    title: "Hemat Air",
    desc: "Penyiraman berdasarkan kondisi tanah dan kebutuhan tanaman.",
  },
  {
    icon: "/landing/clock.svg",
    title: "Efisiensi Waktu",
    desc: "Monitoring dan kontrol irigasi jarak jauh via website.",
  },
  {
    icon: "/landing/data.svg",
    title: "Data Real-Time",
    desc: "Keputusan irigasi berdasarkan data, bukan perkiraan.",
  },
  {
    icon: "/landing/scale.svg",
    title: "Skalabel",
    desc: "Dapat diterapkan pada berbagai macam jenis lahan.",
  },
] as const;

export const FEATURES = [
  {
    title: "Energi Terbarukan Berbasis Panel Surya",
    desc: "ADOSISTERING memanfaatkan panel surya sebagai sumber energi utama untuk mendukung operasional sistem irigasi. Dengan pendekatan ini, sistem dapat berjalan secara mandiri, efisien, dan ramah lingkungan, khususnya pada wilayah lahan yang terbatas akses listrik.",
    img: "/landing/feature-image-1.png",
    alt: "Panel surya sebagai sumber energi sistem irigasi pintar ADOSISTERING",
    subs: [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
        title: "Panel Surya",
        desc: "Sumber daya listrik dihasilkan melalui energi matahari untuk mendukung operasional sistem.",
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        title: "Efisiensi Biaya Operasional",
        desc: "Mengurangi ketergantungan pada listrik konvensional sehingga biaya operasional jangka panjang menjadi lebih hemat.",
      },
    ],
  },
  {
    title: "Kontrol Irigasi",
    desc: "Pengelolaan sistem irigasi secara real-time melalui integrasi sensor dan kontrol pompa berbasis IoT.",
    img: "/landing/feature-image-2.png",
    alt: "Dashboard kontrol irigasi ADOSISTERING",
    subs: [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        title: "Data Realtime",
        desc: "Menampilkan kondisi lahan secara langsung untuk mendukung keputusan irigasi.",
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
        title: "Data Cloud",
        desc: "Seluruh data tersimpan dan dapat diakses melalui dashboard monitoring.",
      },
    ],
  },
  {
    title: "Sensor Kelembaban Tanah",
    desc: "Sistem membaca tingkat kelembaban tanah secara berkala untuk menentukan kebutuhan irigasi yang optimal. Data ini menjadi dasar dalam mengatur ambang batas penyiraman agar penggunaan air lebih efisien.",
    img: "/landing/feature-image-3.png",
    alt: "Tampilan data sensor kelembaban tanah pada dashboard ADOSISTERING",
    subs: [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
        title: "Database",
        desc: "Data kelembaban tersimpan secara sistematis untuk analisis historis dan evaluasi kondisi lahan.",
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
        title: "Pembantu Keputusan",
        desc: "Sistem membantu menentukan waktu penyiraman yang tepat agar penggunaan air lebih efisien.",
      },
    ],
  },
  {
    title: "Riwayat Irigasi",
    desc: "ADOSISTERING menyediakan rekam jejak aktivitas irigasi yang mencakup kelembaban tanah, debit aliran, volume air, serta status penyiraman untuk setiap blok lahan.",
    img: "/landing/feature-image-4.png",
    alt: "Tabel riwayat irigasi pada platform ADOSISTERING",
    subs: [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        title: "Catat Otomatis",
        desc: "Seluruh aktivitas irigasi tercatat secara otomatis untuk memastikan transparansi dan akurasi data.",
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
        title: "Filter Riwayat",
        desc: "Pengguna dapat menyaring data berdasarkan waktu atau blok lahan untuk menganalisis efektivitas sistem irigasi.",
      },
    ],
  },
] as const;

export const STATS = [
  { value: "2023", label: "Proyek Pertama" },
  { value: "70+%", label: "Efisiensi Air" },
  { value: "3", label: "Pilot Project" },
  { value: "60+", label: "Adaptasi Petani" },
] as const;

export const LOCATIONS = [
  {
    name: "Desa KedungBenda, Purbalingga",
    img: "/landing/implement-kedungbenda.png",
    desc: "ADOSISTERING mengintegrasikan sensor, kontrol pompa, dan dashboard monitoring untuk membantu petani mengambil keputusan irigasi yang tepat.",
  },
  {
    name: "Kawista Emji Mernek Jenek, Cilacap",
    img: "/landing/implement-mernek_jenek.png",
    desc: "ADOSISTERING mengintegrasikan sensor, kontrol pompa, dan dashboard monitoring untuk membantu petani mengambil keputusan irigasi yang tepat.",
  },
  {
    name: "Desa Dawuhan, Banyumas",
    img: "/landing/implement-dawuhan.png",
    desc: "ADOSISTERING mengintegrasikan sensor, kontrol pompa, dan dashboard monitoring untuk membantu petani mengambil keputusan irigasi yang tepat.",
  },
] as const;

export const CONTACT_USER_TYPES = [
  { value: "petani", label: "Petani" },
  { value: "peneliti", label: "Peneliti" },
  { value: "instansi", label: "Instansi Pemerintah" },
  { value: "perusahaan", label: "Perusahaan" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export const CONTACT_CARDS = [
  {
    icon: "/landing/telephone.svg",
    title: "Telepon & WhatsApp",
    lines: ["(0281) 641629", "+62 812-3994-2119"],
  },
  {
    icon: "/landing/service.svg",
    title: "Waktu Pelayanan",
    lines: ["Daily: 08:00-16:00", "Weekend: 10:00-15:00"],
  },
  {
    icon: "/landing/message.svg",
    title: "Sampaikan Pesan",
    lines: ["adosisteringteam@gmail.com", "purwokerto.telkomuniversity.ac.id"],
  },
] as const;

export const DIRECTOR_PROFILE = {
  name: "Sudianto, S.Pd., M.Kom.",
  role: "Direktur",
  quote:
    "Pemanfaatan teknologi berbasis data dalam sistem irigasi menjadi langkah penting untuk meningkatkan efisiensi dan keberlanjutan pertanian.",
  img: "/landing/direktur-image.png",
} as const;

export const PARTNERS = [
  { src: "/landing/telkom-university-logo.png", alt: "Telkom University - Mitra ADOSISTERING" },
  { src: "/landing/pertamina-logo.png", alt: "Pertamina - Mitra ADOSISTERING" },
  { src: "/landing/mernek_jenek-logo.png", alt: "MernekJenek - Mitra ADOSISTERING" },
] as const;

export const COLAB_CONTENT = {
  title: "Bersama Mewujudkan Pertanian yang Lebih Efektif dan Berkelanjutan",
  desc: "Mari berkolaborasi untuk masa depan pertanian Indonesia yang lebih efisien dan berdaya saing.",
  ctaLabel: "Hubungi Kami",
} as const;

export const FOOTER_LINKS = [
  { label: "Beranda", href: "#beranda" },
  { label: "Fitur", href: "#fitur" },
  { label: "Implementasi", href: "#implementasi" },
  { label: "Hubungi Kami", href: "#hubungi-kami" },
  { label: "Mitra Kami", href: "#mitra-kami" },
] as const;

export const LANDING_DESCRIPTION =
  "Adosistering adalah sistem irigasi cerdas berbasis IoT yang dirancang untuk membantu pengelolaan air secara efisien, akurat, dan berkelanjutan melalui pendekatan berbasis data.";

export const SOCIAL_LINKS = [
  { href: "https://instagram.com/adosistering", label: "Instagram", icon: "instagram" },
  { href: "https://youtube.com/@adosistering", label: "YouTube", icon: "youtube" },
  { href: "https://tiktok.com/@adosistering", label: "TikTok", icon: "tiktok" },
] as const;

export const CONTACT_INFO = {
  phone: "+62 812-3994-2119",
  email: "adosisteringteam@gmail.com",
  address:
    "Jl. DI Panjaitan No.128, Karangreja, Purwokerto Kidul, Kec. Purwokerto Sel., Kabupaten Banyumas, Jawa Tengah 53147",
} as const;
