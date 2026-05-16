import { For } from "solid-js";
import type { DashboardRegion } from "./DashboardTypes";
import { BlockCard } from "./BlockCard";

export function RegionSection(props: { region: DashboardRegion }) {
  return (
    <section class="space-y-4">
      <div class="px-1">
        <h2 class="text-lg font-bold text-[#4F4F4F]">{props.region.name}</h2>
        <p class="text-sm text-[#6B6B6B]">{props.region.description ?? "Wilayah irigasi"}</p>
      </div>
      <div class="space-y-5">
        <For each={props.region.blocks}>
          {(block) => (
            <BlockCard
              blockName={block.name}
              regionName={props.region.name}
              sprayers={block.sprayers}
              threshold={props.region.threshold}
            />
          )}
        </For>
      </div>
    </section>
  );
}
