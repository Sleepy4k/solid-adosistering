import { LOCATIONS } from "~/constants/landing";

export default function UseCasesSection() {
  return (
    <section id="implementasi" class="overflow-hidden bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <h2 class="mb-14 text-center text-3xl font-extrabold leading-tight text-[#67b744] sm:text-4xl md:mb-20 md:text-5xl lg:text-[3.5rem]">
          Lokasi Implementasi
          <br />&amp; Uji Lapangan
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
