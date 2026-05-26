import { query, createAsync } from "@solidjs/router";
import { createEffect, createMemo, createSignal, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import {
  getMapWorkspace,
  saveBlockMapGeometry,
  saveMapConfig,
  type MapPoint,
  type MapWorkspace,
} from "~/server/actions/index";
import { SkCard } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { LeafletMap, type LeafletPolygon, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import { SelectSearch } from "~/components/ui/SelectSearch";

const loadMapWorkspace = query((key: number) => {
  void key;
  return getMapWorkspace();
}, "map-workspace");
export const route = { preload: () => loadMapWorkspace(0) };

function CoordInput(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-slate-600">{props.label}</label>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onInput={(e) => {
          const v = parseFloat(e.currentTarget.value);
          if (!isNaN(v)) props.onChange(v);
        }}
        class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
    </div>
  );
}

function pointsFromGeojson(value: unknown): MapPoint[] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: string; coordinates?: unknown };
  const coordinates = geo.type === "Polygon" && Array.isArray(geo.coordinates) ? geo.coordinates[0] : [];
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    })
    .filter((point): point is MapPoint => Boolean(point));
}

function pointsToText(points: MapPoint[]) {
  const normalized =
    points.length > 1 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng
      ? points.slice(0, -1)
      : points;
  return normalized.map((point) => `${point.lat}, ${point.lng}`).join("\n");
}

function textToPoints(value: string) {
  const points: MapPoint[] = [];
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const [latRaw, lngRaw] = line.split(/[,\s]+/);
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { points, error: `Koordinat tidak valid: ${line}` };
    points.push({ lat, lng });
  }
  if (points.length > 0 && points.length < 3) return { points, error: "Polygon membutuhkan minimal 3 titik." };
  return { points, error: "" };
}

function colorForIndex(index: number) {
  return ["#3b82f6", "#67B744", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5] ?? "#3b82f6";
}

function MapConfigForm(props: { initial: MapWorkspace; onSaved: () => void }) {
  const { notify } = useToast();
  const [lat, setLat] = createSignal(props.initial.lat);
  const [lng, setLng] = createSignal(props.initial.lng);
  const [zoom, setZoom] = createSignal(props.initial.zoom);
  const [selectedRegionId, setSelectedRegionId] = createSignal(props.initial.regions[0]?.id ?? "");
  const [selectedBlockId, setSelectedBlockId] = createSignal(props.initial.regions[0]?.blocks[0]?.id ?? "");
  const [pointsText, setPointsText] = createSignal("");
  const [savingConfig, setSavingConfig] = createSignal(false);
  const [savingGeometry, setSavingGeometry] = createSignal(false);

  const selectedRegion = createMemo(
    () => props.initial.regions.find((region) => region.id === selectedRegionId()) ?? props.initial.regions[0],
  );
  const selectedBlock = createMemo(
    () => selectedRegion()?.blocks.find((block) => block.id === selectedBlockId()) ?? selectedRegion()?.blocks[0],
  );
  const parsedPoints = createMemo(() => textToPoints(pointsText()));

  createEffect(() => {
    const region = selectedRegion();
    if (!region) return;
    if (!region.blocks.some((block) => block.id === selectedBlockId())) {
      setSelectedBlockId(region.blocks[0]?.id ?? "");
    }
  });

  createEffect(() => {
    const block = selectedBlock();
    setPointsText(pointsToText(pointsFromGeojson(block?.polygonGeojson)));
  });

  const markers = createMemo<LeafletRegionMarker[]>(() =>
    props.initial.regions
      .filter((region) => region.latitude !== null && region.longitude !== null)
      .map((region) => ({ id: region.id, name: region.name, lat: region.latitude!, lng: region.longitude! })),
  );

  const polygons = createMemo<LeafletPolygon[]>(() =>
    props.initial.regions.flatMap((region, regionIndex) =>
      region.blocks.map((block, blockIndex) => {
        const isEditing = block.id === selectedBlock()?.id && !parsedPoints().error;
        return {
          id: block.id,
          name: `${region.name} - ${block.name}`,
          points: (isEditing ? parsedPoints().points : pointsFromGeojson(block.polygonGeojson)).map(
            (point) => [point.lat, point.lng] as [number, number],
          ),
          color: block.id === selectedBlock()?.id ? "#ef4444" : colorForIndex(regionIndex + blockIndex),
        };
      }),
    ),
  );

  const saveDefaultMap = async (e: SubmitEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await saveMapConfig({ lat: lat(), lng: lng(), zoom: zoom() });
      notify({ kind: "success", title: "Konfigurasi peta berhasil disimpan" });
      props.onSaved();
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan konfigurasi peta" });
    } finally {
      setSavingConfig(false);
    }
  };

  const saveGeometry = async () => {
    const block = selectedBlock();
    const parsed = parsedPoints();
    if (!block) return;
    if (parsed.error) {
      notify({ kind: "error", title: parsed.error });
      return;
    }
    setSavingGeometry(true);
    try {
      await saveBlockMapGeometry({ blockId: block.id, points: parsed.points });
      notify({ kind: "success", title: "Koordinat block berhasil disimpan" });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan koordinat block";
      notify({ kind: "error", title: msg });
    } finally {
      setSavingGeometry(false);
    }
  };

  return (
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div class="flex flex-col gap-5">
        <form onSubmit={saveDefaultMap} class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="mb-4">
            <h2 class="font-semibold text-slate-900">Titik Pusat Peta Default</h2>
            <p class="text-sm text-slate-500">Koordinat dan zoom level yang digunakan saat peta pertama kali dibuka</p>
          </div>
          <div class="grid gap-5 sm:grid-cols-3">
            <CoordInput label="Latitude" value={lat()} min={-90} max={90} step={0.0001} onChange={setLat} />
            <CoordInput label="Longitude" value={lng()} min={-180} max={180} step={0.0001} onChange={setLng} />
            <CoordInput label="Zoom Level (1-22)" value={zoom()} min={1} max={22} step={1} onChange={setZoom} />
          </div>
          <div class="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={savingConfig()}
              class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {savingConfig() ? "Menyimpan..." : "Simpan Default"}
            </button>
          </div>
        </form>

        <LeafletMap center={[lat(), lng()]} zoom={zoom()} markers={markers()} polygons={polygons()} class="h-[540px]" />
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <h2 class="font-semibold text-slate-900">Koordinat Block</h2>
        <p class="mt-1 text-sm text-slate-500">
          Pilih region dan block, lalu isi titik polygon satu koordinat per baris.
        </p>

        <div class="mt-5 flex flex-col gap-4">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-600">Region</label>
            <SelectSearch
              value={selectedRegionId()}
              options={props.initial.regions.map((region) => ({ value: region.id, label: region.name }))}
              onChange={setSelectedRegionId}
            />
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-600">Block</label>
            <SelectSearch
              value={selectedBlockId()}
              options={(selectedRegion()?.blocks ?? []).map((block) => ({ value: block.id, label: block.name }))}
              onChange={setSelectedBlockId}
            />
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-600">Titik Polygon</label>
            <textarea
              value={pointsText()}
              onInput={(e) => setPointsText(e.currentTarget.value)}
              rows="12"
              placeholder={"-7.6114, 109.1773\n-7.6112, 109.1781\n-7.6120, 109.1780"}
              class="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <Show when={parsedPoints().error}>
              <p class="mt-2 text-xs text-rose-600">{parsedPoints().error}</p>
            </Show>
            <Show when={!parsedPoints().error && parsedPoints().points.length > 0}>
              <p class="mt-2 text-xs text-slate-500">{parsedPoints().points.length} titik siap disimpan.</p>
            </Show>
          </div>

          <button
            type="button"
            disabled={savingGeometry() || !selectedBlock()}
            onClick={saveGeometry}
            class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {savingGeometry() ? "Menyimpan..." : "Simpan Koordinat Block"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PetaKonfigurasi() {
  const [refreshKey, setRefreshKey] = createSignal(0);
  const workspace = createAsync(() => loadMapWorkspace(refreshKey()));

  return (
    <>
      <PageMeta page="mapConfiguration" />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Konfigurasi Peta</h1>

        <Suspense fallback={<SkCard />}>
          <Show
            when={workspace()}
            fallback={
              <div class="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Belum ada region untuk dikonfigurasi.
              </div>
            }
          >
            {(data) => <MapConfigForm initial={data()} onSaved={() => setRefreshKey((key) => key + 1)} />}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
