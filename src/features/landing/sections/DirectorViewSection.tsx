import { DIRECTOR_PROFILE } from "~/constants/landing";

export default function DirectorViewSection() {
  return (
    <section class="relative overflow-hidden bg-white">
      <div class="relative z-10 container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="grid min-h-[420px] items-stretch md:min-h-[460px] lg:min-h-[500px] lg:grid-cols-[38%_62%] lg:grid-rows-[auto_1fr]">
          <div
            class="pointer-events-none relative -z-10 col-start-1 row-start-3 w-screen min-w-0 max-w-none justify-self-center bg-[#67b744] lg:col-span-2 lg:col-start-1 lg:row-start-2"
            aria-hidden="true"
          />
          <div class="flex items-end justify-center lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:justify-start">
            <img
              src={DIRECTOR_PROFILE.img}
              alt="Foto Sudianto, S.Pd., M.Kom. - Direktur ADOSISTERING"
              class="h-auto w-[220px] object-contain object-bottom sm:w-[260px] md:w-[320px] lg:w-[380px] xl:w-[420px]"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              width={DIRECTOR_PROFILE.width}
              height={DIRECTOR_PROFILE.height}
            />
          </div>
          <div class="flex items-center justify-end pb-6 pl-6 pt-10 md:pl-10 md:pt-14 lg:col-start-2 lg:row-start-1 lg:pl-16">
            <h2 class="text-right text-2xl font-extrabold leading-tight text-[#67b744] sm:text-3xl md:text-4xl lg:text-[3rem]">
              Pandangan Direktur
            </h2>
          </div>
          <div class="col-start-1 row-start-3 flex flex-col justify-center pb-6 pl-6 md:pl-10 md:pb-8 lg:col-start-2 lg:row-start-2 lg:pl-16 lg:pb-10">
            <blockquote class="mb-6 md:mb-8">
              <p class="text-lg leading-relaxed text-white sm:text-xl md:text-[1.35rem] lg:text-[1.5rem]">
                &ldquo;{DIRECTOR_PROFILE.quote}&rdquo;
              </p>
            </blockquote>
            <cite class="block text-xl font-bold leading-snug text-white not-italic sm:text-2xl lg:text-3xl">
              {DIRECTOR_PROFILE.name}
            </cite>
            <p class="mt-1.5 text-sm text-white/70 sm:text-base">{DIRECTOR_PROFILE.role}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
