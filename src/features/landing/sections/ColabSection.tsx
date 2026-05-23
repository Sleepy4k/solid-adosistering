import { COLAB_CONTENT } from "~/constants/landing";
import { scrollToId } from "~/features/landing/utils";

export default function ColabSection() {
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
          {COLAB_CONTENT.title}
        </h2>
        <p class="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg md:mb-10 md:text-xl">
          {COLAB_CONTENT.desc}
        </p>
        <a
          href="#hubungi-kami"
          class="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-neutral-900 transition-all duration-200 hover:bg-white/80 hover:shadow-lg"
          onClick={(e) => {
            e.preventDefault();
            scrollToId("#hubungi-kami");
          }}
        >
          {COLAB_CONTENT.ctaLabel}
        </a>
      </div>
    </section>
  );
}
