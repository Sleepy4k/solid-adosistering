import { PARTNERS } from "~/constants/landing";

export default function MitraSection() {
  return (
    <section id="mitra-kami" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="mb-16 flex justify-center md:mb-20">
          <img
            src="/landing/mitra-title.png"
            alt="Mitra Kami"
            class="h-auto w-auto max-w-[220px] sm:max-w-[300px] md:max-w-[380px] lg:max-w-[440px]"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            width={2164}
            height={552}
          />
        </div>
        <div class="flex flex-col items-center justify-center gap-6 sm:flex-row md:gap-8 lg:gap-10">
          {PARTNERS.map((partner) => (
            <div class="group flex h-32 w-full items-center justify-center rounded-2xl bg-neutral-100 px-8 py-8 transition-all duration-300 hover:shadow-md sm:w-72 md:h-36 md:w-80 md:px-12 md:py-10 lg:h-40 lg:w-[340px]">
              <img
                src={partner.src}
                alt={partner.alt}
                class="max-h-16 w-auto object-contain grayscale transition-all duration-500 group-hover:grayscale-0 md:max-h-20 lg:max-h-24"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                width={partner.width}
                height={partner.height}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
