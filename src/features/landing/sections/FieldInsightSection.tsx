import { TESTIMONIALS } from "~/constants/landing";

export default function FieldInsightSection() {
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
            {TESTIMONIALS.map((item) => (
              <div class="group flex gap-5">
                <div class="w-1 shrink-0 rounded-full bg-[#535353] transition-colors duration-300 group-hover:bg-[#58B00F]" />
                <div class="flex flex-col items-start gap-5 sm:flex-row">
                  <img
                    src={item.img}
                    alt={`Foto ${item.name}`}
                    class="h-[80px] w-[80px] shrink-0 object-contain sm:h-[100px] sm:w-[100px]"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    width={item.width}
                    height={item.height}
                  />
                  <div>
                    <h3 class="text-xl font-bold text-neutral-900 sm:text-2xl">{item.name}</h3>
                    <p class="mt-0.5 text-sm text-neutral-400 sm:text-base">{item.role}</p>
                    <p class="mt-3 text-sm leading-relaxed text-neutral-600 sm:text-base">
                      &ldquo;{item.quote}&rdquo;
                    </p>
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
