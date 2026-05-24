import { DEFAULT_WEB_CONFIG } from "~/constants/landing";
import type { WebConfig } from "~/server/actions/index";

type HeroSectionProps = {
  config: WebConfig;
};

export default function HeroSection(props: HeroSectionProps) {
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
            <h1 class="text-left text-4xl font-extrabold uppercase leading-tight tracking-widest text-white sm:text-5xl md:text-6xl">
              {props.config.projectName}
            </h1>
            <p class="mt-5 max-w-xl text-left text-lg leading-relaxed text-white/80 sm:text-2xl md:text-3xl">
              {props.config.tagline ?? DEFAULT_WEB_CONFIG.tagline}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
