import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { isFirebaseConfigured, subscribeToRegionPump } from "~/lib/client/firebaseClient";
import type { DashboardRegion } from "./DashboardTypes";
import { BlockCard } from "./BlockCard";

export function RegionSection(props: { region: DashboardRegion; readOnly?: boolean }) {
  // `null` until the firmware has reported `<region>/pump/state`.
  const [pumpOn, setPumpOn] = createSignal<boolean | null>(null);

  onMount(() => {
    if (!isFirebaseConfigured()) return;
    onCleanup(subscribeToRegionPump({ regionName: props.region.name }, setPumpOn));
  });

  return (
    <section class="space-y-4">
      <div class="px-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-bold text-[#4F4F4F]">{props.region.name}</h2>
          <Show when={pumpOn() !== null}>
            <Badge tone={pumpOn() ? "success" : "muted"}>{pumpOn() ? "Pompa Utama Aktif" : "Pompa Utama Mati"}</Badge>
          </Show>
        </div>
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
              volumeDivider={props.region.volumeDivider}
              showWindDirection={props.region.showWindDirection}
              showAutoIrrigation={props.region.showAutoIrrigation}
              readOnly={props.readOnly}
            />
          )}
        </For>
      </div>
    </section>
  );
}
