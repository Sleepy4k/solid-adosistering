import { SOLUTION_HIGHLIGHTS } from "~/constants/landing";

export default function SolutionSection() {
  return (
    <section id="solusi" class="overflow-hidden bg-white">
      <div class="container mx-auto max-w-screen-xl px-4 pt-16 sm:px-6 md:pt-24 lg:px-12 lg:pt-32 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/solution-title.png"
            alt="Solusi Irigasi Cerdas"
            class="h-auto w-auto max-w-[240px] sm:max-w-[340px] md:max-w-[420px] lg:max-w-[480px]"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            width={2164}
            height={552}
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
              decoding="async"
              fetchpriority="low"
              width={3212}
              height={2739}
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
                    <img
                      src={item.icon}
                      alt=""
                      class="h-11 w-11 sm:h-12 sm:w-12"
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      width={48}
                      height={48}
                    />
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
