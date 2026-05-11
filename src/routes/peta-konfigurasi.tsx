import { cache, createAsync } from "@solidjs/router";
import { createSignal, Show, Suspense } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { getMapConfig, saveMapConfig, type MapConfig } from "~/server/actions";
import { SkCard } from "~/components/Sk";
import { useToast } from "~/components/ToastProvider";

const loadMapConfig = cache(() => getMapConfig(), "map-config");
export const route = { preload: () => loadMapConfig() };

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

function MapConfigForm(props: { initial: MapConfig }) {
  const { notify } = useToast();
  const [lat, setLat] = createSignal(props.initial.lat);
  const [lng, setLng] = createSignal(props.initial.lng);
  const [zoom, setZoom] = createSignal(props.initial.zoom);
  const [saving, setSaving] = createSignal(false);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveMapConfig({ lat: lat(), lng: lng(), zoom: zoom() });
      notify({ kind: "success", title: "Konfigurasi peta berhasil disimpan" });
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan konfigurasi peta" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} class="flex flex-col gap-6">
      <div class="grid gap-5 sm:grid-cols-3">
        <CoordInput label="Latitude" value={lat()} min={-90} max={90} step={0.0001} onChange={setLat} />
        <CoordInput label="Longitude" value={lng()} min={-180} max={180} step={0.0001} onChange={setLng} />
        <CoordInput label="Zoom Level (1–18)" value={zoom()} min={1} max={18} step={1} onChange={setZoom} />
      </div>

      {/* Preview info */}
      <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Titik pusat peta: <span class="font-semibold text-slate-900">{lat().toFixed(6)}, {lng().toFixed(6)}</span> — Zoom: <span class="font-semibold text-slate-900">{zoom()}</span>
      </div>

      {/* Map placeholder */}
      <div class="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        <div class="text-center">
          <svg class="mx-auto mb-2 h-10 w-10 opacity-30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <polygon stroke-linecap="round" stroke-linejoin="round" points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line stroke-linecap="round" x1="8" y1="2" x2="8" y2="18" />
            <line stroke-linecap="round" x1="16" y1="6" x2="16" y2="22" />
          </svg>
          Pratinjau peta akan tampil di sini<br />
          <span class="text-xs">(Leaflet map — dikonfigurasi saat produksi)</span>
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="submit"
          disabled={saving()}
          class="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving() ? "Menyimpan…" : "Simpan Konfigurasi"}
        </button>
      </div>
    </form>
  );
}

export default function PetaKonfigurasi() {
  const config = createAsync(() => loadMapConfig());

  return (
    <>
      <Title>Konfigurasi Peta | Adosistering</Title>
      <Meta name="description" content="Atur koordinat pusat dan zoom level default peta irigasi." />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Konfigurasi Peta</h1>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="border-b border-slate-100 px-5 py-4">
            <h2 class="font-semibold text-slate-900">Titik Pusat Peta Default</h2>
            <p class="text-sm text-slate-500">Koordinat dan zoom level yang digunakan saat peta pertama kali dibuka</p>
          </div>
          <div class="p-6">
            <Suspense fallback={<SkCard />}>
              <Show when={config()}>
                {(c) => <MapConfigForm initial={c()} />}
              </Show>
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}
