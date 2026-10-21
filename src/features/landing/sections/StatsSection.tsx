import { STATS } from "~/constants/landing";

export default function StatsSection() {
  return (
    <section
      class="relative overflow-hidden bg-[#67b744] py-16 md:py-20"
      aria-label="Statistik pencapaian ADOSISTERING"
    >
      <div class="relative container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 gap-8 min-[420px]:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {STATS.map((stat) => (
            <div class="text-center">
              <div class="mb-4 text-[clamp(1.875rem,9vw,3rem)] font-extrabold text-white">{stat.value}</div>
              <div class="text-lg text-white">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
