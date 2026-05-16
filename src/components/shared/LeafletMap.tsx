import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

type LatLng = [number, number];

export type LeafletRegionMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type LeafletPolygon = {
  id: string;
  name: string;
  points: LatLng[];
  color?: string;
};

type LeafletModule = typeof Leaflet;
type LeafletMapInstance = Leaflet.Map;
type TileLayer = Leaflet.TileLayer;
type LayerGroup = Leaflet.LayerGroup;

function resolveLeafletModule(module: unknown): LeafletModule {
  const candidates = [
    module,
    (module as { default?: unknown }).default,
    ((module as { default?: { default?: unknown } }).default ?? {}).default,
  ];
  const resolved = candidates.find((candidate) => {
    const value = candidate as Partial<LeafletModule> | undefined;
    return typeof value?.tileLayer === "function" && typeof value?.map === "function";
  });
  if (!resolved) throw new Error("Leaflet module tidak valid.");
  return resolved as LeafletModule;
}

function validPoint(point: LatLng) {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function defaultCenter(markers: LeafletRegionMarker[], fallback: LatLng): LatLng {
  const valid = markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
  if (valid.length === 0) return fallback;
  return [
    valid.reduce((sum, marker) => sum + marker.lat, 0) / valid.length,
    valid.reduce((sum, marker) => sum + marker.lng, 0) / valid.length,
  ];
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function yellowPin(L: LeafletModule) {
  return L.divIcon({
    className: "",
    html: '<div style="width:20px;height:20px;background:#f59e0b;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -22],
  });
}

export function LeafletMap(props: {
  class?: string;
  markers?: LeafletRegionMarker[];
  polygons?: LeafletPolygon[];
  center?: LatLng;
  zoom?: number;
}) {
  let el: HTMLDivElement | undefined;
  let L: LeafletModule | undefined;
  let map: LeafletMapInstance | undefined;
  let satellite: TileLayer | undefined;
  let standard: TileLayer | undefined;
  let markerLayer: LayerGroup | undefined;
  let polygonLayer: LayerGroup | undefined;

  const [ready, setReady] = createSignal(false);
  const [tileType, setTileType] = createSignal<"satellite" | "standard">("satellite");
  const [showPolygons, setShowPolygons] = createSignal(true);
  const [error, setError] = createSignal("");

  const redrawOverlays = () => {
    if (!L || !map || !markerLayer || !polygonLayer) return;
    markerLayer.clearLayers();
    polygonLayer.clearLayers();

    const bounds: LatLng[] = [];
    for (const marker of props.markers ?? []) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;
      const point: LatLng = [marker.lat, marker.lng];
      bounds.push(point);
      L.marker(point, { icon: yellowPin(L) })
        .bindPopup(
          `<div style="text-align:center;min-width:110px"><strong>${escapeHtml(marker.name)}</strong><br><span style="font-size:11px;color:#6b7280">Wilayah</span></div>`,
        )
        .addTo(markerLayer);
    }

    for (const polygon of props.polygons ?? []) {
      const points = polygon.points.filter(validPoint);
      if (points.length < 3) continue;
      bounds.push(...points);
      L.polygon(points, {
        color: polygon.color ?? "#3b82f6",
        weight: 2,
        opacity: 1,
        fillColor: polygon.color ?? "#3b82f6",
        fillOpacity: 0.35,
      })
        .bindPopup(`<div style="min-width:120px;text-align:center"><strong>${escapeHtml(polygon.name)}</strong></div>`)
        .addTo(polygonLayer);
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [42, 42], maxZoom: 18, animate: false });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], Math.max(props.zoom ?? 13, 12), { animate: false });
    }
  };

  onMount(async () => {
    if (!el) return;
    try {
      const leafletModule = await import("leaflet/dist/leaflet-src.esm.js");
      L = resolveLeafletModule(leafletModule);
      const center = props.center ?? defaultCenter(props.markers ?? [], [-7.617, 109.15]);
      satellite = L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        attribution: "&copy; Google Maps",
        maxZoom: 22,
        maxNativeZoom: 21,
      });
      standard = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 22,
        maxNativeZoom: 19,
      });
      markerLayer = L.layerGroup();
      polygonLayer = L.layerGroup();
      map = L.map(el, {
        center,
        zoom: props.zoom ?? 13,
        minZoom: 5,
        maxZoom: 22,
        zoomControl: true,
        layers: [satellite, markerLayer, polygonLayer],
      });
      setReady(true);
      setTimeout(() => map?.invalidateSize(), 50);
      redrawOverlays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Leaflet gagal dimuat.");
    }
  });

  createEffect(() => {
    if (!ready() || !map || !satellite || !standard) return;
    if (tileType() === "satellite") {
      if (map.hasLayer(standard)) map.removeLayer(standard);
      if (!map.hasLayer(satellite)) map.addLayer(satellite);
      satellite.bringToBack();
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(standard)) map.addLayer(standard);
      standard.bringToBack();
    }
  });

  createEffect(() => {
    if (!ready() || !map || !polygonLayer) return;
    if (showPolygons()) {
      if (!map.hasLayer(polygonLayer)) map.addLayer(polygonLayer);
    } else if (map.hasLayer(polygonLayer)) {
      map.removeLayer(polygonLayer);
    }
  });

  createEffect(() => {
    if (!ready()) return;
    props.markers;
    props.polygons;
    redrawOverlays();
  });

  createEffect(() => {
    if (!ready() || !map || !props.center) return;
    map.setView(props.center, props.zoom ?? map.getZoom(), { animate: false });
  });

  onCleanup(() => {
    map?.off();
    map?.remove();
    map = undefined;
  });

  return (
    <div class={`iot-land-map-wrap relative overflow-hidden rounded-2xl bg-[#f0f0f0] ${props.class ?? "h-[520px]"}`}>
      <div ref={el} class="h-full min-h-[320px] w-full" />

      <div class="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div class="flex rounded-lg bg-white p-1 shadow-lg">
          <button
            type="button"
            class={`rounded-md px-3 py-1.5 text-xs font-semibold ${tileType() === "satellite" ? "bg-[#67B744] text-white" : "text-gray-600 hover:bg-gray-100"}`}
            onClick={() => setTileType("satellite")}
          >
            Satelit
          </button>
          <button
            type="button"
            class={`rounded-md px-3 py-1.5 text-xs font-semibold ${tileType() === "standard" ? "bg-[#67B744] text-white" : "text-gray-600 hover:bg-gray-100"}`}
            onClick={() => setTileType("standard")}
          >
            Standar
          </button>
        </div>
        <button
          type="button"
          class="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-lg hover:bg-gray-50"
          onClick={() => setShowPolygons((value) => !value)}
        >
          {showPolygons() ? "Sembunyikan Polygon" : "Tampilkan Polygon"}
        </button>
      </div>

      <Show when={!ready() && !error()}>
        <div class="absolute inset-0 grid place-items-center bg-white/65 backdrop-blur-[1px]">
          <div class="w-52">
            <div class="skeleton mb-3 h-4 w-full" />
            <div class="skeleton h-4 w-2/3" />
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <div class="absolute inset-x-4 bottom-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
          {error()}
        </div>
      </Show>
    </div>
  );
}
