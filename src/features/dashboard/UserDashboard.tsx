import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { Card } from "~/components/ui/Card";
import type { DashboardRegion } from "./DashboardTypes";
import { MapCard } from "./MapCard";
import { RegionSection } from "./RegionSection";

export function UserDashboard(props: { regions: DashboardRegion[] }) {
  return (
    <div class="space-y-5">
      <Card class="px-5 py-4 text-sm italic text-[#4F4F4F]">
        Irigasi otomatis menyalakan pompa berdasarkan kelembaban tanah. Batas kelembaban tanah dapat diatur pada menu{" "}
        <A href="/settings" class="font-semibold text-[#186D3C] underline">
          pengaturan
        </A>
        .
      </Card>
      <MapCard regions={props.regions} />
      <For each={props.regions}>{(region) => <RegionSection region={region} />}</For>
      <Show when={props.regions.length === 0}>
        <Card class="p-10 text-center text-sm text-[#6B6B6B]">Belum ada blok yang ditetapkan untuk akun ini.</Card>
      </Show>
    </div>
  );
}
