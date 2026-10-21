import { A, createAsync, query, revalidate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, on, onCleanup, Show, Suspense } from "solid-js";
import { MapPin, Plus } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { LeafletMap, type LeafletPolygon, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import { SkCard } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { BlockCreateModal } from "~/features/map-configuration/BlockCreateModal";
import { PolygonPointEditor } from "~/features/map-configuration/PolygonPointEditor";
import {
  blankPolygonRows,
  pointsFromGeojson,
  pointsToRows,
  validatePolygonRows,
  type PolygonRow,
} from "~/lib/shared/polygon";
import { getMapWorkspace, saveBlockMapGeometry, saveMapConfig } from "~/server/actions/map";
import type { BlockCreateResult, MapBlock, MapWorkspace } from "~/types/map";

const loadMapWorkspace = query(() => getMapWorkspace(), "map-workspace");
export const route = { preload: () => loadMapWorkspace() };

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

function rowsForBlock(block: MapBlock | undefined): PolygonRow[] {
  const points = pointsFromGeojson(block?.polygonGeojson);
  return points.length > 0 ? pointsToRows(points) : blankPolygonRows();
}

function colorForIndex(index: number) {
  return ["#3b82f6", "#67B744", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5] ?? "#3b82f6";
}

function EmptyRegions() {
  return (
    <div class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-10">
      <MapPin size={28} class="mx-auto text-slate-400" aria-hidden="true" />
      <h2 class="mt-3 text-lg font-semibold text-slate-900">Belum ada region</h2>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Tambahkan region terlebih dahulu sebelum mengatur titik pusat peta dan polygon block.
      </p>
      <A
        href="/region-management"
        class="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Buka Manajemen Region
      </A>
    </div>
  );
}

function MapConfigForm(props: { initial: MapWorkspace; onSaved: () => Promise<void> }) {
  const { notify } = useToast();
  const firstBlock = props.initial.regions[0]?.blocks[0];
  const [lat, setLat] = createSignal<number>(props.initial.lat);
  const [lng, setLng] = createSignal<number>(props.initial.lng);
  const [zoom, setZoom] = createSignal<number>(props.initial.zoom);
  const [selectedRegionId, setSelectedRegionId] = createSignal<string>(props.initial.regions[0]?.id ?? "");
  const [selectedBlockId, setSelectedBlockId] = createSignal<string>(firstBlock?.id ?? "");
  const [rows, setRows] = createSignal<PolygonRow[]>(rowsForBlock(firstBlock));
  const [showRowErrors, setShowRowErrors] = createSignal<boolean>(false);
  const [pendingBlockId, setPendingBlockId] = createSignal<string | null>(null);
  const [showCreateBlock, setShowCreateBlock] = createSignal<boolean>(false);
  const [savingConfig, setSavingConfig] = createSignal<boolean>(false);
  const [savingGeometry, setSavingGeometry] = createSignal<boolean>(false);

  const selectedRegion = createMemo(
    () => props.initial.regions.find((region) => region.id === selectedRegionId()) ?? props.initial.regions[0],
  );
  const selectedBlock = createMemo(
    () => selectedRegion()?.blocks.find((block) => block.id === selectedBlockId()) ?? selectedRegion()?.blocks[0],
  );
  const validation = createMemo(() => validatePolygonRows(rows()));

  createEffect(() => {
    const region = selectedRegion();
    if (!region) return;
    if (!region.blocks.some((block) => block.id === selectedBlockId())) {
      setSelectedBlockId(region.blocks[0]?.id ?? "");
    }
  });

  createEffect(
    on(
      () => selectedBlock()?.id ?? "",
      () => {
        setRows(rowsForBlock(selectedBlock()));
        setShowRowErrors(false);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const pendingId = pendingBlockId();
    if (!pendingId) return;
    for (const region of props.initial.regions) {
      if (!region.blocks.some((block) => block.id === pendingId)) continue;
      setSelectedRegionId(region.id);
      setSelectedBlockId(pendingId);
      setPendingBlockId(null);
      return;
    }
  });

  const markers = createMemo<LeafletRegionMarker[]>(() =>
    props.initial.regions
      .filter((region) => region.latitude !== null && region.longitude !== null)
      .map((region) => ({
        id: region.id,
        name: region.name,
        lat: region.latitude as number,
        lng: region.longitude as number,
      })),
  );

  const preview = createMemo(() => {
    const stored = pointsFromGeojson(selectedBlock()?.polygonGeojson);
    const draft = validation();
    const useDraft = draft.valid && draft.points.length >= 3;
    return { points: useDraft ? draft.points : stored, stored, useDraft };
  });

  // Debounce only the points drawn by Leaflet so every keystroke does not rebuild
  // all polygons; inline validation and errors stay immediate.
  const [previewPoints, setPreviewPoints] = createSignal(preview().points);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const clearPreviewTimer = () => {
    if (previewTimer === undefined) return;
    clearTimeout(previewTimer);
    previewTimer = undefined;
  };

  createEffect(
    on(
      () => selectedBlock()?.id ?? "",
      () => {
        // A block switch must not show the previous block's draft geometry.
        clearPreviewTimer();
        setPreviewPoints(preview().points);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => preview(),
      (next) => {
        clearPreviewTimer();
        if (!next.useDraft) {
          setPreviewPoints(next.points);
          return;
        }
        previewTimer = setTimeout(() => {
          previewTimer = undefined;
          setPreviewPoints(next.points);
        }, 120);
      },
      { defer: true },
    ),
  );

  onCleanup(clearPreviewTimer);

  const previewNotice = createMemo(() => {
    const draft = validation();
    if (!draft.hasInput || draft.valid) return "";
    return preview().stored.length >= 3
      ? "Pratinjau memakai polygon tersimpan sampai koordinat baru valid."
      : "Pratinjau peta menunggu minimal 3 titik yang valid.";
  });

  const polygons = createMemo<LeafletPolygon[]>(() =>
    props.initial.regions.flatMap((region, regionIndex) =>
      region.blocks.map((block, blockIndex) => {
        const isSelected = block.id === selectedBlock()?.id;
        const points = isSelected ? previewPoints() : pointsFromGeojson(block.polygonGeojson);
        return {
          id: block.id,
          name: `${region.name} - ${block.name}`,
          points: points.map((point) => [point.lat, point.lng] as [number, number]),
          color: isSelected ? "#ef4444" : colorForIndex(regionIndex + blockIndex),
        };
      }),
    ),
  );

  const refreshAfterWrite = async () => {
    try {
      await props.onSaved();
    } catch (error) {
      // The write succeeded; only the reload failed, so warn instead of reporting a failed save.
      console.error("[map-configuration] failed to refresh workspace after save", error);
      notify({
        kind: "warning",
        title: "Perubahan tersimpan, tetapi data terbaru gagal dimuat ulang.",
        message: "Muat ulang halaman untuk memastikan data terbaru tampil.",
      });
    }
  };

  const saveDefaultMap = async (e: SubmitEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      try {
        await saveMapConfig({ lat: lat(), lng: lng(), zoom: zoom() });
      } catch (error) {
        const message = error instanceof Response ? await error.text().catch(() => "") : "";
        notify({ kind: "error", title: message || "Gagal menyimpan konfigurasi peta" });
        return;
      }
      notify({ kind: "success", title: "Konfigurasi peta berhasil disimpan" });
      await refreshAfterWrite();
    } finally {
      setSavingConfig(false);
    }
  };

  const saveGeometry = async () => {
    const block = selectedBlock();
    if (!block) return;
    setShowRowErrors(true);
    const result = validation();
    if (!result.valid) {
      notify({ kind: "error", title: result.formError || "Koordinat block belum valid" });
      return;
    }
    setSavingGeometry(true);
    try {
      try {
        await saveBlockMapGeometry({ blockId: block.id, points: result.points });
      } catch (error) {
        const message = error instanceof Response ? await error.text().catch(() => "") : "";
        notify({ kind: "error", title: message || "Gagal menyimpan koordinat block" });
        return;
      }
      notify({ kind: "success", title: "Koordinat block berhasil disimpan" });
      await refreshAfterWrite();
    } finally {
      setSavingGeometry(false);
    }
  };

  const handleBlockCreated = async (block: BlockCreateResult) => {
    setPendingBlockId(block.id);
    setShowCreateBlock(false);
    // Best effort: the modal already succeeded, so this must not mask the workspace refresh result.
    void revalidate("regions-list").catch(() => undefined);
    try {
      await props.onSaved();
    } catch (error) {
      console.error("[map-configuration] failed to refresh workspace after block creation", error);
      notify({
        kind: "warning",
        title: "Block berhasil dibuat, tetapi daftar block gagal dimuat ulang.",
        message: "Muat ulang halaman untuk melihat block terbaru.",
      });
    }
  };

  return (
    <>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div class="flex min-w-0 flex-col gap-5">
          <form onSubmit={saveDefaultMap} class="rounded-xl border border-slate-200 bg-white p-5">
            <div class="mb-4">
              <h2 class="font-semibold text-slate-900">Titik Pusat Peta Default</h2>
              <p class="text-sm text-slate-500">
                Koordinat dan zoom level yang digunakan saat peta pertama kali dibuka
              </p>
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
                class="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingConfig() ? "Menyimpan..." : "Simpan Default"}
              </button>
            </div>
          </form>

          <div class="flex flex-col gap-2">
            <LeafletMap
              center={[lat(), lng()]}
              zoom={zoom()}
              markers={markers()}
              polygons={polygons()}
              autoFit={false}
              class="h-[clamp(300px,55dvh,540px)]"
            />
            <Show when={previewNotice()}>
              <p class="text-xs text-amber-600">{previewNotice()}</p>
            </Show>
          </div>
        </div>

        <div class="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-semibold text-slate-900">Koordinat Block</h2>
              <p class="mt-1 text-sm text-slate-500">
                Pilih region dan block, lalu isi titik polygon memakai kolom Latitude (Y) dan Longitude (X).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateBlock(true)}
              class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={16} aria-hidden="true" />
              Tambah Block
            </button>
          </div>

          <div class="mt-5 flex flex-col gap-4">
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-600">Region</label>
              <SelectSearch
                value={selectedRegionId()}
                options={props.initial.regions.map((region) => ({ value: region.id, label: region.name }))}
                onChange={setSelectedRegionId}
              />
            </div>

            <Show
              when={selectedRegion()?.blocks.length ? selectedRegion() : undefined}
              fallback={
                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p class="text-sm font-medium text-slate-700">Region ini belum memiliki block</p>
                  <p class="mt-1 text-xs text-slate-500">
                    Tambahkan block terlebih dahulu untuk mengatur polygon koordinat.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateBlock(true)}
                    class="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Plus size={16} aria-hidden="true" />
                    Tambah Block
                  </button>
                </div>
              }
            >
              {(region) => (
                <>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-slate-600">Block</label>
                    <SelectSearch
                      value={selectedBlockId()}
                      options={region().blocks.map((block) => ({ value: block.id, label: block.name }))}
                      placeholder="Pilih block"
                      onChange={setSelectedBlockId}
                    />
                  </div>

                  <Show when={selectedBlock()}>
                    {(block) => (
                      <div class="flex flex-col gap-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <span class="text-xs font-medium text-slate-600">Titik Polygon</span>
                          <span class="text-xs text-slate-400">{validation().points.length} titik valid</span>
                        </div>

                        <PolygonPointEditor
                          rows={rows()}
                          validation={validation()}
                          showErrors={showRowErrors()}
                          disabled={savingGeometry()}
                          resetKey={selectedBlock()?.id}
                          onChange={setRows}
                        />

                        <Show when={block().firebaseSyncStatus === "FAILED"}>
                          <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Block tersimpan, tetapi sinkronisasi Firebase belum berhasil. Coba simpan ulang setelah
                            koneksi Firebase pulih.
                          </p>
                        </Show>

                        <button
                          type="button"
                          disabled={savingGeometry()}
                          onClick={saveGeometry}
                          class="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {savingGeometry() ? "Menyimpan..." : "Simpan Koordinat Block"}
                        </button>
                      </div>
                    )}
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>

      <Show when={showCreateBlock() && selectedRegion()}>
        {(region) => (
          <BlockCreateModal
            region={{ id: region().id, name: region().name }}
            onClose={() => setShowCreateBlock(false)}
            onCreated={handleBlockCreated}
          />
        )}
      </Show>
    </>
  );
}

export default function PetaKonfigurasi() {
  const workspace = createAsync(() => loadMapWorkspace());
  const refreshWorkspace = async () => {
    await revalidate("map-workspace");
  };

  return (
    <>
      <PageMeta page="mapConfiguration" />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Konfigurasi Peta</h1>

        <Suspense fallback={<SkCard />}>
          <Show when={workspace()} fallback={<EmptyRegions />}>
            {(data) => (
              <Show when={data().regions.length > 0} fallback={<EmptyRegions />}>
                <MapConfigForm initial={data()} onSaved={refreshWorkspace} />
              </Show>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
