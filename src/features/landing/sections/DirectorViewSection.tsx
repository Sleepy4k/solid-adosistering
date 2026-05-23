import { DIRECTOR_PROFILE } from "~/constants/landing";

export default function DirectorViewSection() {
  return (
    <section class="relative overflow-hidden bg-white">
      <div class="absolute bottom-0 left-0 right-0 h-[52%] bg-[#67b744]" />
      <div class="relative z-10 container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="grid min-h-[420px] items-stretch md:min-h-[460px] lg:grid-cols-[38%_62%] lg:min-h-[500px]">
          <div class="flex items-end justify-center lg:justify-start">
            <img
              src={DIRECTOR_PROFILE.img}
              alt="Foto Sudianto, S.Pd., M.Kom. - Direktur ADOSISTERING"
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
      </div>
    </section>
  );
}
