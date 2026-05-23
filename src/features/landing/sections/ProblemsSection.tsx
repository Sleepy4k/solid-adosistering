import { PROBLEMS } from "~/constants/landing";

export default function ProblemsSection() {
  return (
    <section id="masalah" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-8 lg:px-16">
        <div class="mb-20 flex justify-center md:mb-28">
          <img
            src="/landing/problem-title.png"
            alt="Masalah Umum Irigasi"
            class="h-auto w-auto max-w-[280px] sm:max-w-[380px] md:max-w-[480px] lg:max-w-[560px]"
            loading="lazy"
          />
        </div>
        <div class="space-y-20 md:space-y-28 lg:space-y-36">
          {PROBLEMS.map((problem, index) => (
            <div
              class={`grid items-center gap-10 md:gap-16 lg:gap-20 ${index % 2 !== 0 ? "md:grid-cols-[6fr_5fr]" : "md:grid-cols-[5fr_6fr]"}`}
            >
              <div class={`space-y-4 ${index % 2 !== 0 ? "md:order-2" : ""}`}>
                <h3 class="text-3xl font-extrabold leading-tight text-emerald-700 sm:text-4xl lg:text-[2.6rem]">
                  {problem.title}
                </h3>
                <p class="text-base leading-relaxed text-slate-500 sm:text-lg">{problem.desc}</p>
              </div>
              <div class={index % 2 !== 0 ? "md:order-1" : ""}>
                <img src={problem.img} alt={problem.alt} class="h-auto w-full" loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
