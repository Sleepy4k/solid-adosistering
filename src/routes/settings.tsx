import { cache, createAsync } from "@solidjs/router";
import { createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { Edit3 } from "lucide-solid";
import { getMySettings, saveSafetyTimeout, saveThreshold } from "~/server/actions/index";
import { SkCard } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { SelectSearch } from "~/components/ui/SelectSearch";

const loadSettings = cache(() => getMySettings(), "my-settings");
export const route = { preload: () => loadSettings() };

type Settings = Awaited<ReturnType<typeof getMySettings>>;
type UserSettingsData = Settings & { role: "USER" };
type Preference = "KERING" | "LEMBAB" | "BASAH";

const preferenceLabels: Record<Preference, string> = {
  KERING: "Kering",
  LEMBAB: "Lembab",
  BASAH: "Basah",
};

function currentDate() {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function EditButton(props: { editing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="inline-flex items-center gap-2 rounded-lg border border-[#C2C2C2] px-4 py-2 text-sm text-[#4F4F4F] hover:bg-gray-50"
    >
      <Edit3 size={16} />
      {props.editing ? "Selesai" : "Edit"}
    </button>
  );
}

function DualRange(props: {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onMin: (value: number) => void;
  onMax: (value: number) => void;
}) {
  const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
  const range = () => props.max - props.min;
  const minPct = () => ((clamp(props.minValue) - props.min) / range()) * 100;
  const maxPct = () => ((clamp(props.maxValue) - props.min) / range()) * 100;
  const unit = () => props.unit ?? "%";
  const ticks = () => {
    if (props.max <= 10) {
      return Array.from({ length: props.max - props.min + 1 }, (_, index) => props.min + index);
    }
    const values = [];
    for (let value = props.min; value <= props.max; value += 25) values.push(value);
    if (values[values.length - 1] !== props.max) values.push(props.max);
    return values;
  };

  return (
    <div class="relative pb-2 pt-8">
      <div
        class="absolute top-0 z-10 -translate-x-1/2 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
        style={{ left: `${minPct()}%` }}
      >
        {clamp(props.minValue)}
        {unit()}
      </div>
      <div
        class="absolute top-0 z-10 -translate-x-1/2 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
        style={{ left: `${maxPct()}%` }}
      >
        {clamp(props.maxValue)}
        {unit()}
      </div>

      <div class="relative h-2">
        <div class="absolute h-2 w-full rounded-full bg-[#E5E5E5]" />
        <div
          class="absolute h-2 rounded-full bg-primary"
          style={{ left: `${minPct()}%`, width: `${maxPct() - minPct()}%` }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.minValue)}
          disabled={props.disabled}
          onInput={(event) => props.onMin(Number(event.currentTarget.value))}
          class="dual-range-slider dual-range-min absolute h-2 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.maxValue)}
          disabled={props.disabled}
          onInput={(event) => props.onMax(Number(event.currentTarget.value))}
          class="dual-range-slider dual-range-max absolute h-2 w-full appearance-none bg-transparent"
        />
      </div>

      <div
        class="mt-4 grid px-1 text-[11px] text-gray-400"
        style={{ "grid-template-columns": `repeat(${ticks().length}, minmax(0, 1fr))` }}
      >
        <For each={ticks()}>
          {(tick, index) => (
            <span
              class={`${index() === 0 ? "text-left" : index() === ticks().length - 1 ? "text-right" : "text-center"}`}
            >
              {tick}
              {unit()}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

function clampTimeout(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function RegionSelector(props: {
  regions: UserSettingsData["regions"];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  return (
    <Show when={props.regions.length > 1}>
      <div class="rounded-2xl border border-[#C2C2C2] bg-white p-5">
        <label class="mb-2 block text-sm font-medium text-[#4F4F4F]">Region</label>
        <SelectSearch
          value={props.selectedId}
          options={props.regions.map((region) => ({ value: region.id, label: region.name }))}
          onChange={props.onChange}
        />
      </div>
    </Show>
  );
}

function IrrigationControl(props: { region: UserSettingsData["regions"][number] }) {
  const { notify } = useToast();
  const [editing, setEditing] = createSignal(false);
  const [dry, setDry] = createSignal(props.region.threshold?.dryMaxPercent ?? 40);
  const [wet, setWet] = createSignal(props.region.threshold?.wetMinPercent ?? 80);
  const [preference, setPreference] = createSignal<Preference>(props.region.threshold?.landPreference ?? "LEMBAB");
  const [displayDry, setDisplayDry] = createSignal(props.region.threshold?.displayDryMaxPercent ?? 40);
  const [displayMoist, setDisplayMoist] = createSignal(props.region.threshold?.displayMoistMaxPercent ?? 70);
  const [displayWet, setDisplayWet] = createSignal(props.region.threshold?.displayWetMinPercent ?? 80);
  const [saving, setSaving] = createSignal(false);

  const reset = () => {
    setDry(props.region.threshold?.dryMaxPercent ?? 40);
    setWet(props.region.threshold?.wetMinPercent ?? 80);
    setPreference(props.region.threshold?.landPreference ?? "LEMBAB");
    setDisplayDry(props.region.threshold?.displayDryMaxPercent ?? 40);
    setDisplayMoist(props.region.threshold?.displayMoistMaxPercent ?? 70);
    setDisplayWet(props.region.threshold?.displayWetMinPercent ?? 80);
  };

  const save = async () => {
    if (dry() >= wet()) {
      notify({ kind: "warning", title: "Batas kering harus lebih kecil dari batas basah" });
      return;
    }
    if (!(displayDry() < displayMoist() && displayMoist() < displayWet())) {
      notify({ kind: "warning", title: "Urutan kondisi lahan harus Kering < Lembab < Basah" });
      return;
    }
    setSaving(true);
    try {
      await saveThreshold({
        regionId: props.region.id,
        dryMaxPercent: dry(),
        wetMinPercent: wet(),
        displayDryMaxPercent: displayDry(),
        displayMoistMaxPercent: displayMoist(),
        displayWetMinPercent: displayWet(),
        landPreference: preference(),
      });
      setEditing(false);
      notify({ kind: "success", title: "Pengaturan kontrol irigasi disimpan" });
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan pengaturan" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white">
      <div class="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
        <h2 class="text-lg font-bold text-[#4F4F4F]">Kontrol Irigasi</h2>
        <EditButton editing={editing()} onClick={() => setEditing((value) => !value)} />
      </div>

      <div class="grid gap-6 p-6 lg:grid-cols-2">
        <div class="rounded-xl border border-[#E5E5E5] p-5">
          <h3 class="mb-2 text-base font-bold text-[#4F4F4F]">Kelembaban Tanah</h3>
          <p class="mb-6 text-sm text-[#6B7280]">
            Tentukan batas nilai kelembaban tanah untuk mengatur nyala atau mati pompa secara otomatis.
          </p>
          <DualRange
            min={0}
            max={100}
            minValue={dry()}
            maxValue={wet()}
            disabled={!editing()}
            onMin={(value) => setDry(Math.min(value, wet() - 5))}
            onMax={(value) => setWet(Math.max(value, dry() + 5))}
          />
          <p class="mb-6 mt-4 text-xs italic text-[#6B7280]">
            Setting ini diterapkan ke semua sprayer pada region {props.region.name}.
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              disabled={!editing() || saving()}
              onClick={save}
              class="btn-3d-green h-11 flex-1 font-semibold text-white disabled:opacity-50"
            >
              {saving() ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              disabled={!editing()}
              onClick={reset}
              class="h-11 flex-1 rounded-xl border border-[#C2C2C2] bg-white font-semibold text-[#4F4F4F] hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-[#E5E5E5] p-5">
          <h3 class="mb-2 text-base font-medium text-[#4F4F4F]">Kondisi Lahan</h3>
          <p class="mb-6 text-sm text-[#6B7280]">
            Tentukan batas label kondisi lahan untuk tampilan Dashboard dan Riwayat. Nilai ini hanya disimpan di
            database SQL.
          </p>
          <div class="mb-6 flex justify-center gap-4">
            <For each={Object.entries(preferenceLabels) as [Preference, string][]}>
              {([value, label]) => (
                <button
                  type="button"
                  disabled={!editing()}
                  onClick={() => setPreference(value)}
                  class={`text-sm transition-colors disabled:cursor-not-allowed ${preference() === value ? "font-semibold text-[#186D3C] underline decoration-2 underline-offset-8" : "text-gray-500"}`}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
          <Show when={preference() === "KERING"}>
            <label class="mb-2 block text-sm font-medium text-[#4F4F4F]">Batas Maksimal Kering</label>
            <div class="mb-6 flex items-center overflow-hidden rounded-xl border border-[#C2C2C2] bg-white">
              <input
                type="number"
                min="0"
                max="100"
                value={displayDry()}
                disabled={!editing()}
                onInput={(event) => setDisplayDry(Number(event.currentTarget.value))}
                class="h-11 w-full px-4 text-sm font-semibold text-[#4F4F4F] outline-none disabled:bg-gray-50"
              />
              <span class="px-4 text-sm font-semibold text-[#6B7280]">%</span>
            </div>
          </Show>
          <Show when={preference() === "LEMBAB"}>
            <label class="mb-2 block text-sm font-medium text-[#4F4F4F]">Batas Maksimal Lembab</label>
            <div class="mb-6 flex items-center overflow-hidden rounded-xl border border-[#C2C2C2] bg-white">
              <input
                type="number"
                min="0"
                max="100"
                value={displayMoist()}
                disabled={!editing()}
                onInput={(event) => setDisplayMoist(Number(event.currentTarget.value))}
                class="h-11 w-full px-4 text-sm font-semibold text-[#4F4F4F] outline-none disabled:bg-gray-50"
              />
              <span class="px-4 text-sm font-semibold text-[#6B7280]">%</span>
            </div>
          </Show>
          <Show when={preference() === "BASAH"}>
            <label class="mb-2 block text-sm font-medium text-[#4F4F4F]">Batas Minimal Basah</label>
            <div class="mb-6 flex items-center overflow-hidden rounded-xl border border-[#C2C2C2] bg-white">
              <input
                type="number"
                min="0"
                max="100"
                value={displayWet()}
                disabled={!editing()}
                onInput={(event) => setDisplayWet(Number(event.currentTarget.value))}
                class="h-11 w-full px-4 text-sm font-semibold text-[#4F4F4F] outline-none disabled:bg-gray-50"
              />
              <span class="px-4 text-sm font-semibold text-[#6B7280]">%</span>
            </div>
          </Show>
          <div class="mb-6 rounded-xl bg-[#F4F9F2] p-4 text-xs leading-5 text-[#4F4F4F]">
            Kering: 0-{displayDry()}%, Lembab: {displayDry() + 1}-{displayMoist()}%, Basah: {displayWet()}-100%.
          </div>
          <div class="flex gap-3">
            <button
              type="button"
              disabled={!editing() || saving()}
              onClick={save}
              class="btn-3d-green h-11 flex-1 font-semibold text-white disabled:opacity-50"
            >
              Simpan
            </button>
            <button
              type="button"
              disabled={!editing()}
              onClick={reset}
              class="h-11 flex-1 rounded-xl border border-[#C2C2C2] bg-white font-semibold text-[#4F4F4F] hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyTimeoutPanel(props: { initialMin: number; initialMax: number }) {
  const { notify } = useToast();
  const [editing, setEditing] = createSignal(false);
  const [minVal, setMinVal] = createSignal(clampTimeout(props.initialMin));
  const [maxVal, setMaxVal] = createSignal(clampTimeout(props.initialMax));
  const [saving, setSaving] = createSignal(false);

  const reset = () => {
    setMinVal(clampTimeout(props.initialMin));
    setMaxVal(clampTimeout(props.initialMax));
  };

  const save = async () => {
    if (minVal() >= maxVal()) {
      notify({ kind: "warning", title: "Durasi minimum harus lebih kecil dari maksimum" });
      return;
    }
    setSaving(true);
    try {
      await saveSafetyTimeout({ min: minVal(), max: maxVal() });
      setEditing(false);
      notify({ kind: "success", title: "Safety timeout disimpan" });
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan safety timeout" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white">
      <div class="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
        <h2 class="text-lg font-bold text-[#4F4F4F]">Safety Timeout</h2>
        <EditButton editing={editing()} onClick={() => setEditing((value) => !value)} />
      </div>
      <div class="p-6">
        <div class="rounded-xl border border-[#E5E5E5] p-5">
          <h3 class="mb-2 text-base font-bold text-[#4F4F4F]">Pengaman Irigasi</h3>
          <p class="mb-6 text-sm text-[#6B7280]">
            Tentukan lama waktu ketika alat tidak mengirim data digital ke sistem.
          </p>
          <DualRange
            min={1}
            max={10}
            minValue={minVal()}
            maxValue={maxVal()}
            unit=" menit"
            disabled={!editing()}
            onMin={(value) => setMinVal(clampTimeout(Math.min(value, maxVal() - 1)))}
            onMax={(value) => setMaxVal(clampTimeout(Math.max(value, minVal() + 1)))}
          />
          <p class="mb-6 mt-4 text-xs italic text-[#6B7280]">
            Fitur ini memastikan irigasi aktif dapat dimatikan otomatis saat alat tidak mengirim data.
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              disabled={!editing() || saving()}
              onClick={save}
              class="btn-3d-green h-11 flex-1 font-semibold text-white disabled:opacity-50"
            >
              {saving() ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              disabled={!editing()}
              onClick={reset}
              class="h-11 flex-1 rounded-xl border border-[#C2C2C2] bg-white font-semibold text-[#4F4F4F] hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserSettings(props: { settings: UserSettingsData }) {
  const [selectedRegionId, setSelectedRegionId] = createSignal(props.settings.regions[0]?.id ?? "");
  const selectedRegion = createMemo(
    () => props.settings.regions.find((region) => region.id === selectedRegionId()) ?? props.settings.regions[0],
  );

  return (
    <Show
      when={selectedRegion()}
      fallback={
        <div class="rounded-2xl border border-[#C2C2C2] bg-white p-8 text-center text-sm text-[#6B7280]">
          Belum ada region yang ditugaskan.
        </div>
      }
    >
      {(region) => (
        <>
          <RegionSelector
            regions={props.settings.regions}
            selectedId={selectedRegionId()}
            onChange={setSelectedRegionId}
          />
          <IrrigationControl region={region()} />
          <SafetyTimeoutPanel
            initialMin={props.settings.safetyTimeout.min}
            initialMax={props.settings.safetyTimeout.max}
          />
        </>
      )}
    </Show>
  );
}

function RestrictedSettings(props: { role: "ADMIN" | "SUPERADMIN" }) {
  return (
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      Menu Pengaturan hanya tersedia untuk User. Role {props.role === "ADMIN" ? "Admin" : "Superadmin"} mengelola
      konfigurasi dari menu khususnya.
    </div>
  );
}

export default function Pengaturan() {
  const settings = createAsync(() => loadSettings());

  return (
    <>
      <PageMeta page="settings" />

      <div class="space-y-6">
        <div class="rounded-2xl border border-[#C2C2C2] bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 class="text-xl font-bold text-[#4F4F4F] sm:text-2xl">Pengaturan</h1>
            <p class="text-xs text-gray-500 sm:text-sm">{currentDate()}</p>
          </div>
        </div>

        <Suspense
          fallback={
            <div class="flex flex-col gap-4">
              <SkCard />
              <SkCard />
            </div>
          }
        >
          <Show when={settings()}>
            {(data) => (
              <Show
                when={data().role === "USER"}
                fallback={<RestrictedSettings role={data().role as "ADMIN" | "SUPERADMIN"} />}
              >
                <UserSettings settings={data() as UserSettingsData} />
              </Show>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
