import { Map } from "lucide-solid";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { Card, CardHeader } from "~/components/ui/Card";
import { LeafletMap, type LeafletPolygon, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import { subscribeToBlock } from "~/lib/client/firebaseClient";
import type { DashboardRegion } from "./DashboardTypes";

function pointsFromGeojson(value: unknown): [number, number][] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: string; coordinates?: unknown };
  const coordinates =
    geo.type === "Polygon" && Array.isArray(geo.coordinates)
      ? geo.coordinates[0]
      : Array.isArray(geo.coordinates)
        ? geo.coordinates
        : [];
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as [number, number]) : null;
    })
    .filter((point): point is [number, number] => Boolean(point));
}

function colorForIndex(index: number) {
  return ["#3b82f6", "#67B744", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5] ?? "#3b82f6";
}

function colorForStatus(status?: string) {
  if (status === "Kering") return "#ef4444";
  if (status === "Basah") return "#3b82f6";
  if (status === "Lembab") return "#67B744";
  return null;
}

export function MapCard(props: { regions?: DashboardRegion[] }) {
  const [blockStatuses, setBlockStatuses] = createSignal<Record<string, string>>({});

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
              const statuses = sprayers.map((sprayer) => sprayer.moistureStatus);
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
        color: colorForStatus(blockStatuses()[block.id]) ?? colorForIndex(regionIndex + blockIndex),
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
