import { Map } from "lucide-solid";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { query, createAsync } from "@solidjs/router";
import { Card, CardHeader } from "~/components/ui/Card";
import { LeafletMap, type LeafletPolygon, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import { subscribeToBlock } from "~/lib/client/firebaseClient";
import { getMapDisplayConfig } from "~/server/actions/index";
import type { DashboardRegion } from "./DashboardTypes";
import { colorForIndex, colorForStatus, pointsFromGeojson } from "./helpers";

const loadMapDisplayConfig = query(() => getMapDisplayConfig(), "map-display-config");

export function MapCard(props: { regions?: DashboardRegion[] }) {
  const [blockStatuses, setBlockStatuses] = createSignal<Record<string, string>>({});
  const colors = createAsync(() => loadMapDisplayConfig());
  const mapColors = () => colors() ?? { basahColor: "#3b82f6", keringColor: "#ef4444", lembabColor: "#facc15" };

  createEffect(() => {
    const unsubscribers: (() => void)[] = [];
    for (const region of props.regions ?? []) {
      for (const block of region.blocks) {
        unsubscribers.push(
          subscribeToBlock(
            {
              regionName: region.name,
              blockName: block.name,
              threshold: region.threshold ?? { dryMaxPercent: 40, wetMinPercent: 80 },
            },
            (sprayers) => {
              const statuses = sprayers.map((s) => s.moistureStatus);
              const status = statuses.includes("Kering")
                ? "Kering"
                : statuses.includes("Basah")
                  ? "Basah"
                  : statuses.includes("Lembab")
                    ? "Lembab"
                    : "";
              setBlockStatuses((current) => ({ ...current, [block.id]: status }));
            },
          ),
        );
      }
    }
    onCleanup(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));
  });

  const markers = (): LeafletRegionMarker[] =>
    (props.regions ?? [])
      .filter((region) => region.latitude !== null && region.longitude !== null)
      .map((region) => ({ id: region.id, name: region.name, lat: region.latitude!, lng: region.longitude! }));

  const polygons = (): LeafletPolygon[] =>
    (props.regions ?? []).flatMap((region, regionIndex) =>
      region.blocks.map((block, blockIndex) => ({
        id: block.id,
        name: block.name.replace(/_/g, " "),
        points: pointsFromGeojson(block.polygonGeojson),
        color: colorForStatus(blockStatuses()[block.id], mapColors()) ?? colorForIndex(regionIndex + blockIndex),
      })),
    );

  return (
    <Card class="overflow-hidden">
      <CardHeader
        title={
          <span class="inline-flex items-center gap-2">
            <Map size={20} />
            Peta Area Irigasi IoT
          </span>
        }
      />
      <LeafletMap markers={markers()} polygons={polygons()} class="h-80" />
    </Card>
  );
}
