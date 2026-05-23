import { A, cache, createAsync } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { getWebConfig, saveContactSubmission, type WebConfig } from "~/server/actions/index";
import { getSession } from "~/server/session";

const checkSession = cache(async () => {
  "use server";
  const session = await getSession();
  return session !== null;
}, "landing-session");

const loadLandingConfig = cache(() => getWebConfig(), "landing-web-config");

const DEFAULT_WEB_CONFIG: WebConfig = {
  projectName: "Adosistering",
  logoUrl: null,
  primaryColor: "#67B744",
  tagline: "Sistem Irigasi Cerdas Berbasis IoT untuk Mengoptimalkan Pengairan Lahan Kering",
};

export const route = { preload: () => Promise.all([checkSession(), loadLandingConfig()]), prerender: true };

const NAV_LINKS = [
  { href: "#beranda", label: "Beranda" },
  { href: "#fitur", label: "Fitur" },
  { href: "#implementasi", label: "Implementasi" },
  { href: "#mitra-kami", label: "Mitra Kami" },
];

function scrollToId(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
}

function LandingHeader(props: { config: WebConfig }) {
  const loggedIn = createAsync(() => checkSession());
  const [mobileOpen, setMobileOpen] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);

  onMount(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    onCleanup(() => window.removeEventListener("scroll", handler));
  });

  const handleNavClick = (e: MouseEvent, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    scrollToId(href);
  };

  return (
    <header class="fixed left-0 right-0 top-0 z-50 transition-all duration-300">
      <div class="container mx-auto max-w-screen-xl px-4 pt-5 sm:px-6 lg:px-12 xl:px-16">
        <nav
          class={`flex items-center justify-between rounded-full px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-300 ${
            scrolled()
              ? "border border-neutral-700/30 bg-neutral-900/80 backdrop-blur-xl"
              : "border border-white/20 bg-white/15 backdrop-blur-xl"
          }`}
        >
          <a href="#beranda" class="flex shrink-0 items-center gap-2.5" onClick={(e) => handleNavClick(e, "#beranda")}>
            <img src={props.config.logoUrl ?? "/landing/logo.svg"} alt="" class="h-10 w-auto" loading="eager" />
            <span class="text-xl font-semibold tracking-widest text-white" style="font-family:'Oswald',sans-serif">
              {props.config.projectName}
            </span>
          </a>

          <div class="flex items-center gap-3">
            <ul class="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map((link) => (
                <li>
                  <a
                    href={link.href}
                    class="rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white"
                    onClick={(e) => handleNavClick(e, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="#hubungi-kami"
              class="hidden items-center rounded-full bg-neutral-800/80 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-900 lg:inline-flex"
              onClick={(e) => handleNavClick(e, "#hubungi-kami")}
            >
              Hubungi Kami
            </a>
            <Show
              when={loggedIn()}
              fallback={
                <A
                  href="/login"
                  class="hidden items-center rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 lg:inline-flex"
                >
                  Masuk
                </A>
              }
            >
              <A
                href="/dashboard"
                class="hidden items-center rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 lg:inline-flex"
              >
                Dashboard
              </A>
            </Show>
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <Show
                when={mobileOpen()}
                fallback={
                  <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                }
              >
                <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Show>
            </button>
          </div>
        </nav>
      </div>

      <Show when={mobileOpen()}>
        <div class="mx-4 mt-2 sm:mx-6">
          <div class="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <ul class="space-y-1 px-3 py-3">
              {NAV_LINKS.map((link) => (
                <li>
                  <a
                    href={link.href}
                    class="flex items-center rounded-xl px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
                    onClick={(e) => handleNavClick(e, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li class="px-1 pb-1 pt-1">
                <Show
                  when={loggedIn()}
                  fallback={
                    <A
                      href="/login"
                      class="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      onClick={() => setMobileOpen(false)}
                    >
                      Masuk ke Dashboard
                    </A>
                  }
                >
                  <A
                    href="/dashboard"
                    class="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    onClick={() => setMobileOpen(false)}
                  >
                    Ke Dashboard
                  </A>
                </Show>
              </li>
            </ul>
          </div>
        </div>
      </Show>
    </header>
  );
}

function HeroSection(props: { config: WebConfig }) {
  return (
    <section
      id="beranda"
      class="relative min-h-[600px] overflow-hidden md:min-h-[700px] lg:min-h-[800px]"
      aria-label="Hero"
    >
      <img
        src="/landing/hero-background.jpg"
        alt="Lahan pertanian irigasi pintar ADOSISTERING"
        class="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
      <div class="absolute inset-0 bg-black/50" />
      <div class="absolute inset-0 z-10 flex items-center">
        <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
          <div class="max-w-2xl">
            <h1 class="text-left text-4xl font-extrabold leading-tight tracking-widest text-white sm:text-5xl md:text-6xl">
              {props.config.projectName}
            </h1>
            <p class="mt-5 max-w-xl text-left text-lg leading-relaxed text-white/80 sm:text-2xl md:text-3xl">
              {props.config.tagline ?? DEFAULT_WEB_CONFIG.tagline}
            </p>
            <div class="mt-8 flex flex-wrap gap-4">
              <A
                href="/login"
                class="inline-flex items-center rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-700"
              >
                Mulai Sekarang
              </A>
              <a
                href="#hubungi-kami"
                class="inline-flex items-center rounded-full border border-white/40 px-8 py-3 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("#hubungi-kami");
                }}
              >
                Hubungi Kami
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewSection() {
  return (
    <section id="preview" class="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Preview Platform">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl md:text-5xl">
            Sistem Irigasi Pintar
            <span class="block">Untuk Pertanian Efisien</span>
          </h2>
          <p class="mt-5 text-base leading-relaxed text-slate-500 sm:text-lg">
            Monitoring kelembaban tanah, debit air, dan kontrol pompa secara real-time dalam satu platform terintegrasi.
          </p>
          <div class="mt-7">
            <a
              href="#hubungi-kami"
              class="inline-flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-900"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("#hubungi-kami");
              }}
            >
              Hubungi Kami
            </a>
          </div>
        </div>
        <div class="relative mt-14 flex min-h-[460px] items-end justify-center md:mt-16 md:min-h-[600px] sm:min-h-[520px]">
          <img
            src="/landing/laptop-mockup.png"
            alt="Dashboard platform ADOSISTERING ditampilkan di layar laptop"
            class="relative z-10 h-auto w-full max-w-[680px] drop-shadow-2xl"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

const PROBLEMS = [
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
];

function ProblemsSection() {
  return (
    <section id="masalah" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-8 lg:px-16">
        <div class="mb-20 flex justify-center md:mb-28">
          <img
            src="/landing/problem-title.png"
            alt="Masalah Umum Irigasi"
            class="h-auto w-auto max-w-[280px] sm:max-w-[380px] md:max-w-[480px] lg:max-w-[560px]"
            loading="lazy"
          />
        </div>
        <div class="space-y-20 md:space-y-28 lg:space-y-36">
          {PROBLEMS.map((p, i) => (
            <div
              class={`grid items-center gap-10 md:gap-16 lg:gap-20 ${i % 2 !== 0 ? "md:grid-cols-[6fr_5fr]" : "md:grid-cols-[5fr_6fr]"}`}
            >
              <div class={`space-y-4 ${i % 2 !== 0 ? "md:order-2" : ""}`}>
                <h3 class="text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.6rem]">
                  {p.title}
                </h3>
                <p class="text-base leading-relaxed text-slate-500 sm:text-lg">{p.desc}</p>
              </div>
              <div class={i % 2 !== 0 ? "md:order-1" : ""}>
                <img src={p.img} alt={p.alt} class="h-auto w-full" loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    name: "Sukirno",
    role: "Sekretaris Desa Dawuhan, Banyumas",
    quote:
      "“Keterbatasan air tetap menjadi masalah petani di Desa Dawuhan. Selain itu, irigasi menggunakan pompa berbahan bakar fosil sangat boros terutama bagi petani”",
    img: "/landing/profile-sukirno.png",
  },
  {
    name: "Muchtarom",
    role: "Ketua Harja Tani, KedungBenda",
    quote:
      "“Setiap musim kemarau, persediaan air pasti habis. Sebagai petani kita harus bisa irigasi dengan jumlah air yang sedikit”",
    img: "/landing/profile-muctharom.png",
  },
  {
    name: "Suyitno",
    role: "Pengelola Kawista Emji Mernek, Cilacap",
    quote:
      "“Beberapa hari sekali, petani harus menyiram pupuk ke lahan. Aktivitas ini sangat memakan waktu dan tenaga. Kami harap ada solusi yang lebih efektif”",
    img: "/landing/profile-suyitno.png",
  },
];

function FieldInsightSection() {
  return (
    <section id="insight" class="bg-white py-20 md:py-28 lg:py-36">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-8 lg:px-16">
        <div class="grid items-start gap-12 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <div class="lg:sticky lg:top-32">
            <h2 class="text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.75rem]">
              Berdasarkan Pengalaman Nyata di Lapangan
            </h2>
            <p class="mt-5 text-base leading-relaxed text-slate-500 sm:text-lg">
              Memahami keluh kesah yang dialami petani dan pihak lainnya terkait pengelolaan lahan dengan kondisi cuaca
              yang tidak menentu dan menyulitkan petani.
            </p>
          </div>
          <div class="space-y-10 md:space-y-12">
            {TESTIMONIALS.map((t) => (
              <div class="group flex gap-5">
                <div class="w-1 shrink-0 rounded-full bg-[#535353] transition-colors duration-300 group-hover:bg-[#58B00F]" />
                <div class="flex flex-col items-start gap-5 sm:flex-row">
                  <img
                    src={t.img}
                    alt={`Foto ${t.name}`}
                    class="h-[80px] w-[80px] shrink-0 object-contain sm:h-[100px] sm:w-[100px]"
                    loading="lazy"
                  />
                  <div>
                    <h3 class="text-xl font-bold text-neutral-900 sm:text-2xl">{t.name}</h3>
                    <p class="mt-0.5 text-sm text-neutral-400 sm:text-base">{t.role}</p>
                    <p class="mt-3 text-sm leading-relaxed text-neutral-600 sm:text-base">{t.quote}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const SOLUTION_HIGHLIGHTS = [
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
  { icon: "/landing/data.svg", title: "Data Real-Time", desc: "Keputusan irigasi berdasarkan data, bukan perkiraan." },
  { icon: "/landing/scale.svg", title: "Skalabel", desc: "Dapat diterapkan pada berbagai macam jenis lahan." },
];

function SolutionSection() {
  return (
    <section id="solusi" class="overflow-hidden bg-white">
      <div class="container mx-auto max-w-screen-xl px-4 pt-16 sm:px-6 md:pt-24 lg:px-12 lg:pt-32 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/solution-title.png"
            alt="Solusi Irigasi Cerdas"
            class="h-auto w-auto max-w-[240px] sm:max-w-[340px] md:max-w-[420px] lg:max-w-[480px]"
            loading="lazy"
          />
        </div>
        <div class="grid items-end gap-12 lg:grid-cols-2 lg:gap-16">
          <div class="pb-16 md:pb-24 lg:pb-32">
            <h2 class="text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.75rem]">
              Sistem Irigasi dalam Satu Platform Terintegrasi
            </h2>
            <p class="mt-5 max-w-lg text-base leading-relaxed text-slate-500 sm:text-lg">
              ADOSISTERING mengintegrasikan sensor, kontrol pompa, dan dashboard monitoring untuk membantu petani
              mengambil keputusan irigasi yang tepat.
            </p>
          </div>
          <div class="flex justify-center lg:justify-end">
            <img
              src="/landing/solution-feature.png"
              alt="Tampilan aplikasi ADOSISTERING"
              class="relative z-10 h-auto w-full max-w-[480px] lg:max-w-[600px]"
              loading="lazy"
            />
          </div>
        </div>
      </div>
      <div class="-mt-1 bg-[#67b744]">
        <div class="container mx-auto max-w-screen-xl px-4 py-14 sm:px-6 md:py-16 lg:px-12 lg:py-20 xl:px-16">
          <div class="grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-8 lg:gap-12">
            {SOLUTION_HIGHLIGHTS.map((item) => (
              <div class="text-center">
                <div class="mb-5 flex justify-center">
                  <div class="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md sm:h-24 sm:w-24">
                    <img src={item.icon} alt="" class="h-11 w-11 sm:h-12 sm:w-12" loading="lazy" />
                  </div>
                </div>
                <h3 class="mb-2 text-base font-bold text-white sm:text-lg">{item.title}</h3>
                <p class="text-xs leading-relaxed text-white/80 sm:text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
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
];

function FeaturesGrid() {
  return (
    <section id="fitur" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/feature-title.png"
            alt="Fitur"
            class="h-auto w-full max-w-[260px] sm:max-w-[360px] md:max-w-[460px] lg:max-w-[560px]"
            loading="lazy"
          />
        </div>
        <div class="space-y-20 md:space-y-28 lg:space-y-36">
          {FEATURES.map((f, i) => {
            const imgFirst = i % 2 === 0;
            return (
              <div
                class={`grid items-start gap-10 md:gap-14 lg:gap-20 ${imgFirst ? "md:grid-cols-[5fr_6fr]" : "md:grid-cols-[6fr_5fr]"}`}
              >
                <div class={`overflow-hidden rounded-2xl shadow-lg ${!imgFirst ? "md:order-2" : ""}`}>
                  <img src={f.img} alt={f.alt} class="h-auto w-full" loading="lazy" />
                </div>
                <div class={`flex flex-col justify-center ${!imgFirst ? "md:order-1" : ""}`}>
                  <h3 class="mb-6 text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.75rem]">
                    {f.title}
                  </h3>
                  <p class="mb-10 text-base leading-relaxed text-slate-500 sm:text-lg">{f.desc}</p>
                  <div class="grid grid-cols-2 gap-6 sm:gap-8">
                    {f.subs.map((sub) => (
                      <div>
                        <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                          <span innerHTML={sub.icon} />
                        </div>
                        <h4 class="mb-2 text-base font-bold text-neutral-900 sm:text-lg">{sub.title}</h4>
                        <p class="text-sm leading-relaxed text-slate-500 sm:text-base">{sub.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STATS = [
  { value: "2023", label: "Proyek Pertama" },
  { value: "70+%", label: "Efisiensi Air" },
  { value: "3", label: "Pilot Project" },
  { value: "60+", label: "Adaptasi Petani" },
];

function StatsSection() {
  return (
    <section
      class="relative overflow-hidden bg-[#67b744] py-16 md:py-20"
      aria-label="Statistik pencapaian ADOSISTERING"
    >
      <div class="relative container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-12">
          {STATS.map((s) => (
            <div class="text-center">
              <div class="mb-4 text-5xl font-extrabold text-white sm:text-6xl">{s.value}</div>
              <div class="text-lg text-white">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const LOCATIONS = [
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
];

function UseCasesSection() {
  return (
    <section id="implementasi" class="overflow-hidden bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <h2 class="mb-14 text-center text-3xl font-extrabold leading-tight text-[#67b744] sm:text-4xl md:mb-20 md:text-5xl lg:text-[3.5rem]">
          Lokasi Implementasi
          <br />& Uji Lapangan
        </h2>
        <div class="relative flex min-h-[600px] items-center pb-20 pt-4 md:min-h-[700px] md:pb-28 lg:min-h-[800px] lg:pb-36">
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <img src="/landing/map-background.png" alt="" class="object-cover" loading="lazy" />
          </div>
          <div class="relative z-10 mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3 lg:gap-8">
            {LOCATIONS.map((loc) => (
              <div class="rounded-2xl border border-neutral-100 bg-white p-4 shadow-lg sm:p-5">
                <div class="mb-5 overflow-hidden rounded-xl">
                  <img
                    src={loc.img}
                    alt={`Lokasi implementasi ADOSISTERING di ${loc.name}`}
                    class="h-auto w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <h3 class="mb-2 text-lg font-bold leading-snug text-neutral-900 sm:text-xl">{loc.name}</h3>
                <p class="text-sm leading-relaxed text-slate-500 sm:text-base">{loc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [userType, setUserType] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [success, setSuccess] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim() || !email().trim() || !message().trim()) {
      setError("Nama, email, dan pesan wajib diisi.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await saveContactSubmission({
        name: name(),
        email: email(),
        phone: phone() || undefined,
        userType: userType() || undefined,
        message: message(),
      });
      setSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setUserType("");
      setMessage("");
    } catch {
      setError("Gagal mengirim pesan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="hubungi-kami" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 class="mb-10 text-3xl font-extrabold leading-tight text-emerald-600 sm:text-4xl md:text-5xl">
              Hubungi Kami
            </h2>
            <form class="space-y-6" onSubmit={submit}>
              <div class="grid gap-6 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700" for="lp-nama">
                    Nama <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="lp-nama"
                    type="text"
                    required
                    placeholder="Nama Lengkap"
                    class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700" for="lp-email">
                    Email <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="lp-email"
                    type="email"
                    required
                    placeholder="Alamat email"
                    class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div class="grid gap-6 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700" for="lp-telepon">
                    Nomor Telepon / WA
                  </label>
                  <input
                    id="lp-telepon"
                    type="tel"
                    placeholder="Nomor yang dapat dihubungi"
                    class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    value={phone()}
                    onInput={(e) => setPhone(e.currentTarget.value)}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-slate-700" for="lp-tipe">
                    Tipe Pengguna
                  </label>
                  <SelectSearch
                    value={userType()}
                    placeholder="Pilih tipe pengguna"
                    options={[
                      { value: "", label: "Pilih tipe pengguna" },
                      { value: "petani", label: "Petani" },
                      { value: "peneliti", label: "Peneliti" },
                      { value: "instansi", label: "Instansi Pemerintah" },
                      { value: "perusahaan", label: "Perusahaan" },
                      { value: "lainnya", label: "Lainnya" },
                    ]}
                    onChange={setUserType}
                  />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-slate-700" for="lp-pesan">
                  Pesan <span class="text-red-500">*</span>
                </label>
                <textarea
                  id="lp-pesan"
                  required
                  rows="5"
                  placeholder="Apakah ada yang perlu kami ketahui?"
                  class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  value={message()}
                  onInput={(e) => setMessage(e.currentTarget.value)}
                />
              </div>
              <Show when={error()}>
                <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error()}</p>
              </Show>
              <Show when={success()}>
                <p class="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Pesan berhasil dikirim! Kami akan menghubungi Anda segera.
                </p>
              </Show>
              <button
                type="submit"
                disabled={loading()}
                class="inline-flex items-center rounded-full bg-emerald-600 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading() ? "Mengirim..." : "Kirim Pesan"}
              </button>
            </form>
          </div>

          <div class="flex items-start justify-center lg:justify-end">
            <img
              src="/landing/contact-feature.png"
              alt="Tim ADOSISTERING"
              class="h-auto w-full max-w-lg"
              loading="lazy"
            />
          </div>
        </div>

        <div class="mt-20 grid gap-8 md:mt-28 md:grid-cols-3">
          {[
            {
              icon: "/landing/telephone.svg",
              title: "Telepon & WhatsApp",
              lines: ["(0281) 641629", "+62 812-3994-2119"],
            },
            {
              icon: "/landing/service.svg",
              title: "Waktu Pelayanan",
              lines: ["Senin–Jumat: 08:00–16:00", "Sabtu: 10:00–15:00"],
            },
            {
              icon: "/landing/message.svg",
              title: "Sampaikan Pesan",
              lines: ["adosisteringteam@gmail.com", "purwokerto.telkomuniversity.ac.id"],
            },
          ].map((card) => (
            <div class="text-center">
              <div class="mb-4 flex justify-center">
                <img src={card.icon} alt="" class="h-14 w-14" loading="lazy" />
              </div>
              <h3 class="mb-2 text-lg font-bold text-slate-800">{card.title}</h3>
              {card.lines.map((line) => (
                <p class="text-sm leading-relaxed text-slate-500">{line}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DirectorViewSection() {
  return (
    <section class="relative overflow-hidden bg-white">
      <div class="absolute bottom-0 left-0 right-0 h-[52%] bg-[#67b744]" />
      <div class="relative z-10 container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="grid min-h-[420px] items-stretch md:min-h-[460px] lg:grid-cols-[38%_62%] lg:min-h-[500px]">
          <div class="flex items-end justify-center lg:justify-start">
            <img
              src="/landing/direktur-image.png"
              alt="Foto Sudianto, S.Pd., M.Kom. — Direktur ADOSISTERING"
              class="h-auto w-[220px] object-contain object-bottom sm:w-[260px] md:w-[320px] lg:w-[380px] xl:w-[420px]"
              loading="lazy"
            />
          </div>
          <div class="flex flex-col pl-6 md:pl-10 lg:pl-16">
            <div class="flex h-[48%] items-center justify-end">
              <h2 class="text-right text-3xl font-extrabold leading-tight text-[#67b744] sm:text-4xl md:text-5xl lg:text-[3.25rem]">
                Pandangan Direktur
              </h2>
            </div>
            <div class="flex h-[52%] flex-col justify-center pb-6 md:pb-8 lg:pb-10">
              <blockquote class="mb-6 md:mb-8">
                <p class="text-lg leading-relaxed text-white sm:text-xl md:text-[1.35rem] lg:text-[1.5rem]">
                  &ldquo;Pemanfaatan teknologi berbasis data dalam sistem irigasi menjadi langkah penting untuk
                  meningkatkan efisiensi dan keberlanjutan pertanian.&rdquo;
                </p>
              </blockquote>
              <cite class="block text-xl font-bold leading-snug text-white not-italic sm:text-2xl lg:text-3xl">
                Sudianto, S.Pd., M.Kom.
              </cite>
              <p class="mt-1.5 text-sm text-white/70 sm:text-base">Direktur</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const PARTNERS = [
  { src: "/landing/telkom-university-logo.png", alt: "Telkom University — Mitra ADOSISTERING" },
  { src: "/landing/pertamina-logo.png", alt: "Pertamina — Mitra ADOSISTERING" },
  { src: "/landing/mernek_jenek-logo.png", alt: "MernekJenek — Mitra ADOSISTERING" },
];

function MitraSection() {
  return (
    <section id="mitra-kami" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/mitra-title.png"
            alt="Mitra Kami"
            class="h-auto w-auto max-w-[220px] sm:max-w-[300px] md:max-w-[380px] lg:max-w-[440px]"
            loading="lazy"
          />
        </div>
        <div class="flex flex-col items-center justify-center gap-6 sm:flex-row md:gap-8 lg:gap-10">
          {PARTNERS.map((p) => (
            <div class="group flex h-32 w-full items-center justify-center rounded-2xl bg-neutral-100 px-8 py-8 transition-all duration-300 hover:shadow-md sm:w-72 md:h-36 md:w-80 md:px-12 md:py-10 lg:h-40 lg:w-[340px]">
              <img
                src={p.src}
                alt={p.alt}
                class="max-h-16 w-auto object-contain grayscale transition-all duration-500 group-hover:grayscale-0 md:max-h-20 lg:max-h-24"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ColabSection() {
  return (
    <section
      class="relative flex min-h-[540px] items-center justify-center overflow-hidden md:min-h-[600px] lg:min-h-[770px]"
      aria-labelledby="colab-heading"
    >
      <img src="/landing/colab-bg.png" alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div class="relative z-10 container mx-auto max-w-screen-xl px-4 py-16 text-center sm:px-6 md:py-20 lg:px-12 lg:py-24 xl:px-16">
        <h2
          id="colab-heading"
          class="mx-auto mb-6 max-w-4xl text-2xl font-extrabold leading-tight text-white sm:text-3xl md:mb-8 md:text-4xl lg:text-5xl"
        >
          Bersama Mewujudkan Pertanian yang Lebih Efektif dan Berkelanjutan
        </h2>
        <p class="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg md:mb-10 md:text-xl">
          Mari berkolaborasi untuk masa depan pertanian Indonesia yang lebih efisien dan berdaya saing.
        </p>
        <a
          href="#hubungi-kami"
          class="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-neutral-900 transition-all duration-200 hover:bg-white/80 hover:shadow-lg"
          onClick={(e) => {
            e.preventDefault();
            scrollToId("#hubungi-kami");
          }}
        >
          Hubungi Kami
        </a>
      </div>
    </section>
  );
}

function LandingFooter(props: { config: WebConfig }) {
  const year = new Date().getFullYear();
  const footerLinks = [
    { label: "Beranda", href: "#beranda" },
    { label: "Fitur", href: "#fitur" },
    { label: "Implementasi", href: "#implementasi" },
    { label: "Hubungi Kami", href: "#hubungi-kami" },
    { label: "Mitra Kami", href: "#mitra-kami" },
  ];

  return (
    <footer class="bg-[#1a2e1a] text-white">
      <div class="container mx-auto max-w-screen-xl px-4 pb-10 pt-16 sm:px-6 lg:px-12 xl:px-16 md:pt-20">
        <div class="grid gap-10 md:grid-cols-2 lg:grid-cols-[2fr_1fr_2fr] lg:gap-12">
          <div>
            <div class="mb-6 inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5">
              <img src={props.config.logoUrl ?? "/landing/logo.svg"} alt="" class="h-9 w-auto" />
              <span
                class="font-semibold leading-none text-neutral-900"
                style="font-family:'Oswald',sans-serif;font-size:1.15rem;letter-spacing:0.05em"
              >
                {props.config.projectName}
              </span>
            </div>
            <p class="mb-6 max-w-md text-sm leading-relaxed text-white/60">
              {props.config.projectName} adalah sistem irigasi cerdas berbasis IoT yang dirancang untuk membantu
              pengelolaan air secara efisien, akurat, dan berkelanjutan melalui pendekatan berbasis data.
            </p>
            <div class="mb-8 flex items-center gap-3">
              <a
                href="https://instagram.com/adosistering"
                target="_blank"
                rel="noopener noreferrer"
                class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
                aria-label="Instagram"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
              <a
                href="https://youtube.com/@adosistering"
                target="_blank"
                rel="noopener noreferrer"
                class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
                aria-label="YouTube"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                </svg>
              </a>
            </div>
            <p class="text-xs text-white/40">&copy; {year} {props.config.projectName}. All Right Reserved</p>
          </div>

          <div>
            <h3 class="mb-5 text-base font-bold">Tentang Kami</h3>
            <ul class="space-y-3">
              {footerLinks.map((link) => (
                <li>
                  <a href={link.href} class="text-sm text-white/60 transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div class="space-y-6">
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Telepon</p>
                <p class="text-sm text-white/60">+62 812-3994-2119</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Email</p>
                <p class="text-sm text-white/60">adosisteringteam@gmail.com</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Alamat</p>
                <p class="text-sm leading-relaxed text-white/60">
                  Jl. DI Panjaitan No.128, Purwokerto Kidul, Kec. Purwokerto Sel., Kabupaten Banyumas, Jawa Tengah 53147
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const config = createAsync(() => loadLandingConfig());
  const webConfig = () => ({ ...DEFAULT_WEB_CONFIG, ...(config() ?? {}) });

  onMount(() => {
    document.documentElement.classList.add("landing-scrollbar");
    onCleanup(() => document.documentElement.classList.remove("landing-scrollbar"));
  });

  return (
    <div class="landing-page" style={`--landing-primary:${webConfig().primaryColor}`}>
      <noscript>
        <div class="bg-neutral-950 px-4 py-3 text-center text-sm font-medium text-white">
          JavaScript diperlukan untuk mengirim pesan dan masuk ke dashboard ADOSISTERING.
        </div>
      </noscript>
      <LandingHeader config={webConfig()} />
      <main id="konten-utama">
        <HeroSection config={webConfig()} />
        <PreviewSection />
        <ProblemsSection />
        <FieldInsightSection />
        <SolutionSection />
        <FeaturesGrid />
        <StatsSection />
        <UseCasesSection />
        <ContactSection />
        <DirectorViewSection />
        <MitraSection />
        <ColabSection />
      </main>
      <LandingFooter config={webConfig()} />
    </div>
  );
}
