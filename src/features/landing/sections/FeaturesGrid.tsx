import { FEATURES } from "~/constants/landing";

export default function FeaturesGrid() {
  return (
    <section id="fitur" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/feature-title.png"
            alt="Fitur"
            class="h-auto w-full max-w-[260px] sm:max-w-[360px] md:max-w-[460px] lg:max-w-[560px]"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            width={2164}
            height={552}
          />
        </div>
        <div class="space-y-20 md:space-y-28 lg:space-y-36">
          {FEATURES.map((feature, index) => {
            const imageFirst = index % 2 === 0;
            return (
              <div
                class={`grid items-start gap-10 md:gap-14 lg:gap-20 ${imageFirst ? "md:grid-cols-[5fr_6fr]" : "md:grid-cols-[6fr_5fr]"}`}
              >
                <div class={`overflow-hidden rounded-2xl shadow-lg ${!imageFirst ? "md:order-2" : ""}`}>
                  <img
                    src={feature.img}
                    alt={feature.alt}
                    class="h-auto w-full"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    width={feature.width}
                    height={feature.height}
                  />
                </div>
                <div class={`flex flex-col justify-center ${!imageFirst ? "md:order-1" : ""}`}>
                  <h3 class="mb-6 text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.75rem]">
                    {feature.title}
                  </h3>
                  <p class="mb-10 text-base leading-relaxed text-slate-500 sm:text-lg">{feature.desc}</p>
                  <div class="grid grid-cols-2 gap-6 sm:gap-8">
                    {feature.subs.map((sub) => (
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
