import { scrollToId } from "~/features/landing/utils";

export default function PreviewSection() {
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
        <div class="relative mt-14 flex min-h-[460px] items-end justify-center sm:min-h-[520px] md:mt-16 md:min-h-[600px]">
          <img
            src="/landing/laptop-mockup.png"
            alt="Dashboard platform ADOSISTERING ditampilkan di layar laptop"
            class="relative z-10 h-auto w-full max-w-[680px] drop-shadow-2xl"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            width={4552}
            height={4552}
          />
        </div>
      </div>
    </section>
  );
}
