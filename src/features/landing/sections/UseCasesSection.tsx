import { query, createAsync } from "@solidjs/router";
import { For } from "solid-js";
import { getLandingLocations } from "~/server/actions/index";
import { LOCATIONS } from "~/constants/landing";

const loadLocations = query(() => getLandingLocations(), "landing-locations");

type Item = { name: string; description: string; imageUrl: string | null };

function buildItems(db: Awaited<ReturnType<typeof getLandingLocations>> | undefined): Item[] {
  if (db && db.length > 0) return db.map((l) => ({ name: l.name, description: l.description, imageUrl: l.imageUrl }));
  return LOCATIONS.map((l) => ({ name: l.name, description: l.desc, imageUrl: l.img }));
}

export default function UseCasesSection() {
  const dbData = createAsync(() => loadLocations(), { initialValue: [] });
  const items = () => buildItems(dbData());

  return (
    <section id="implementasi" class="overflow-hidden bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <h2 class="mb-14 text-center text-3xl font-extrabold leading-tight text-[#67b744] sm:text-4xl md:mb-20 md:text-5xl lg:text-[3.5rem]">
          Lokasi Implementasi
          <br />
          &amp; Uji Lapangan
        </h2>
        <div class="relative flex min-h-[600px] items-center pb-20 pt-4 md:min-h-[700px] md:pb-28 lg:min-h-[800px] lg:pb-36">
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <img
              src="/landing/map-background.png"
              alt=""
              class="object-cover"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              width={5376}
              height={2640}
            />
          </div>
          <div class="relative z-10 mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3 lg:gap-8">
            <For each={items()}>
              {(loc) => (
                <div class="rounded-2xl border border-neutral-100 bg-white p-4 shadow-lg sm:p-5">
                  <div class="mb-5 overflow-hidden rounded-xl">
                    <img
                      src={loc.imageUrl ?? ""}
                      alt={`Lokasi implementasi ADOSISTERING di ${loc.name}`}
                      class="h-auto w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                      width={596}
                      height={364}
                    />
                  </div>
                  <h3 class="mb-2 text-lg font-bold leading-snug text-neutral-900 sm:text-xl">{loc.name}</h3>
                  <p class="text-sm leading-relaxed text-slate-500 sm:text-base">{loc.description}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
}
