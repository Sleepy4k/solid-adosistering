import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type * as Leaflet from "leaflet";
import { Layers, LocateFixed, Maximize2, Minimize2 } from "lucide-solid";
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

const DEFAULT_CENTER: LatLng = [-7.617, 109.15];
const DEFAULT_ZOOM = 13;

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
  /** When false, redraws never move the camera (used while editing coordinates). */
  autoFit?: boolean;
}) {
  let wrapper: HTMLDivElement | undefined;
  let el: HTMLDivElement | undefined;
  let L: LeafletModule | undefined;
  let map: LeafletMapInstance | undefined;
  let satellite: TileLayer | undefined;
  let standard: TileLayer | undefined;
  let markerLayer: LayerGroup | undefined;
  let polygonLayer: LayerGroup | undefined;
  let disposed = false;
  let lastFitKey: string | null = null;

  const [ready, setReady] = createSignal<boolean>(false);
  const [tileType, setTileType] = createSignal<"satellite" | "standard">("satellite");
  const [showPolygons, setShowPolygons] = createSignal<boolean>(true);
  const [isFullscreen, setIsFullscreen] = createSignal<boolean>(false);
  const [fullscreenSupported, setFullscreenSupported] = createSignal<boolean>(true);
  const [error, setError] = createSignal<string>("");

  const fitToData = (animate: boolean) => {
    if (!L || !map) return;
    const bounds: LatLng[] = [];
    for (const marker of props.markers ?? []) {
      if (Number.isFinite(marker.lat) && Number.isFinite(marker.lng)) bounds.push([marker.lat, marker.lng]);
    }
    for (const polygon of props.polygons ?? []) {
      bounds.push(...polygon.points.filter(validPoint));
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [42, 42], maxZoom: 18, animate });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], Math.max(props.zoom ?? DEFAULT_ZOOM, 12), { animate });
    } else {
      map.setView(props.center ?? DEFAULT_CENTER, props.zoom ?? DEFAULT_ZOOM, { animate });
    }
  };

  /** Cheap bounds signature: colours and names can change without moving the camera. */
  const fitSignature = () => {
    const parts: string[] = [];
    for (const marker of props.markers ?? []) {
      if (Number.isFinite(marker.lat) && Number.isFinite(marker.lng)) parts.push(`m${marker.lat},${marker.lng}`);
    }
    for (const polygon of props.polygons ?? []) {
      for (const point of polygon.points) {
        if (validPoint(point)) parts.push(`p${point[0]},${point[1]}`);
      }
    }
    return parts.join("|");
  };

  const redrawOverlays = () => {
    if (!L || !map || !markerLayer || !polygonLayer) return;
    markerLayer.clearLayers();
    polygonLayer.clearLayers();

    for (const marker of props.markers ?? []) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;
      L.marker([marker.lat, marker.lng], { icon: yellowPin(L) })
        .bindPopup(
          `<div style="text-align:center;min-width:110px"><strong>${escapeHtml(marker.name)}</strong><br><span style="font-size:11px;color:#6b7280">Wilayah</span></div>`,
        )
        .addTo(markerLayer);
    }

    for (const polygon of props.polygons ?? []) {
      const points = polygon.points.filter(validPoint);
      if (points.length < 3) continue;
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

    if (props.autoFit === false) return;
    const key = fitSignature();
    if (key === lastFitKey) return;
    lastFitKey = key;
    fitToData(false);
  };

  const syncFullscreenState = () => {
    const active = Boolean(wrapper && typeof document !== "undefined" && document.fullscreenElement === wrapper);
    setIsFullscreen(active);
    window.setTimeout(() => {
      if (!disposed) map?.invalidateSize();
    }, 80);
  };

  const toggleFullscreen = async () => {
    if (!wrapper || typeof document === "undefined") return;
    try {
      if (document.fullscreenElement === wrapper) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
      }
    } catch (err) {
      console.error("[map] failed to toggle fullscreen", err);
    }
  };

  onMount(() => {
    const supported =
      typeof document !== "undefined" &&
      document.fullscreenEnabled !== false &&
      wrapper !== undefined &&
      typeof wrapper.requestFullscreen === "function";
    setFullscreenSupported(supported);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    onCleanup(() => document.removeEventListener("fullscreenchange", syncFullscreenState));
  });

  onMount(async () => {
    if (!el) return;
    try {
      const leafletModule = await import("leaflet/dist/leaflet-src.esm.js");
      if (disposed) return;
      L = resolveLeafletModule(leafletModule);
      const center = props.center ?? defaultCenter(props.markers ?? [], DEFAULT_CENTER);
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
        zoom: props.zoom ?? DEFAULT_ZOOM,
        minZoom: 5,
        maxZoom: 22,
        zoomControl: true,
        layers: [satellite, markerLayer, polygonLayer],
      });
      if (disposed) {
        map.remove();
        map = undefined;
        return;
      }
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      setReady(true);
      setTimeout(() => {
        if (!disposed) map?.invalidateSize();
      }, 50);
      redrawOverlays();
    } catch (err) {
      if (disposed) return;
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
    props.autoFit;
    redrawOverlays();
  });

  createEffect(() => {
    if (!ready() || !map || !props.center) return;
    map.setView(props.center, props.zoom ?? map.getZoom(), { animate: false });
  });

  onCleanup(() => {
    disposed = true;
    if (
      typeof document !== "undefined" &&
      wrapper &&
      document.fullscreenElement === wrapper &&
      typeof document.exitFullscreen === "function"
    ) {
      void document.exitFullscreen().catch(() => undefined);
    }
    map?.off();
    map?.remove();
    map = undefined;
  });

  const controlButtonClass =
    "grid h-11 w-11 place-items-center rounded-md text-gray-600 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-40";

  return (
    <>
      <style>{`
        .iot-leaflet-map:fullscreen {
          height: 100dvh;
          width: 100vw;
          border-radius: 0;
        }
        .iot-leaflet-map:fullscreen .iot-leaflet-map-canvas {
          height: 100%;
          min-height: 0;
        }
      `}</style>
      <div
        ref={wrapper}
        role="region"
        aria-label="Peta area irigasi"
        class={`iot-leaflet-map relative overflow-hidden rounded-2xl bg-[#f0f0f0] ${props.class ?? "h-[520px]"}`}
      >
        <div ref={el} class="iot-leaflet-map-canvas h-full w-full" />

        <div class="pointer-events-none absolute inset-x-2 top-2 z-[1000] flex flex-col items-end gap-2 sm:inset-x-3 sm:top-3">
          <div
            class="pointer-events-auto flex max-w-full rounded-lg bg-white p-1 shadow-lg"
            role="group"
            aria-label="Jenis peta"
          >
            <button
              type="button"
              aria-pressed={tileType() === "satellite"}
              title="Tampilkan peta satelit"
              class={`min-h-11 rounded-md px-3 text-xs font-semibold ${
                tileType() === "satellite" ? "bg-[#67B744] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
              onClick={() => setTileType("satellite")}
            >
              Satelit
            </button>
            <button
              type="button"
              aria-pressed={tileType() === "standard"}
              title="Tampilkan peta standar"
              class={`min-h-11 rounded-md px-3 text-xs font-semibold ${
                tileType() === "standard" ? "bg-[#67B744] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
              onClick={() => setTileType("standard")}
            >
              Standar
            </button>
          </div>

          <div class="pointer-events-auto flex max-w-full flex-wrap justify-end gap-2">
            <button
              type="button"
              aria-pressed={showPolygons()}
              title={showPolygons() ? "Sembunyikan polygon blok" : "Tampilkan polygon blok"}
              class="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-left text-xs font-semibold text-gray-700 shadow-lg hover:bg-gray-50"
              onClick={() => setShowPolygons((value) => !value)}
            >
              <Layers size={15} aria-hidden="true" class="shrink-0" />
              <span class="min-w-0">{showPolygons() ? "Sembunyikan Polygon" : "Tampilkan Polygon"}</span>
            </button>

            <div class="flex rounded-lg bg-white p-1 shadow-lg" role="group" aria-label="Alat peta">
              <button
                type="button"
                class={controlButtonClass}
                title="Kembalikan tampilan peta"
                aria-label="Kembalikan tampilan peta"
                disabled={!ready()}
                onClick={() => fitToData(true)}
              >
                <LocateFixed size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                class={controlButtonClass}
                title={isFullscreen() ? "Keluar dari layar penuh" : "Tampilkan peta layar penuh"}
                aria-label={isFullscreen() ? "Keluar dari layar penuh" : "Tampilkan peta layar penuh"}
                aria-pressed={isFullscreen()}
                disabled={!fullscreenSupported()}
                onClick={toggleFullscreen}
              >
                <Show when={isFullscreen()} fallback={<Maximize2 size={17} aria-hidden="true" />}>
                  <Minimize2 size={17} aria-hidden="true" />
                </Show>
              </button>
            </div>
          </div>
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
    </>
  );
}
