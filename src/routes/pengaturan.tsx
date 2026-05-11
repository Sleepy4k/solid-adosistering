import { cache, createAsync } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { getMySettings, saveThreshold, saveSafetyTimeout } from "~/server/actions";
import { SkCard } from "~/components/Sk";
import { useToast } from "~/components/ToastProvider";

const loadSettings = cache(() => getMySettings(), "my-settings");
export const route = { preload: () => loadSettings() };

type Settings = Awaited<ReturnType<typeof getMySettings>>;

// ─── Shared components ────────────────────────────────────────────────────────

function RangeInput(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-slate-700">{props.label}</label>
        <span class="text-sm font-bold text-emerald-700">{props.value}{props.unit ?? "%"}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
      />
      <div class="flex justify-between text-xs text-slate-400">
        <span>{props.min}{props.unit ?? "%"}</span>
        <span>{props.max}{props.unit ?? "%"}</span>
      </div>
    </div>
  );
}

function ThresholdCard(props: {
  blockId: string;
  blockName: string;
  regionName?: string;
  initialDry: number;
  initialWet: number;
}) {
  const { notify } = useToast();
  const [dry, setDry] = createSignal(props.initialDry);
  const [wet, setWet] = createSignal(props.initialWet);
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    if (dry() >= wet()) {
      notify({ kind: "warning", title: "Ambang kering harus lebih kecil dari ambang basah" });
      return;
    }
    setSaving(true);
    try {
      await saveThreshold({ blockId: props.blockId, dryMaxPercent: dry(), wetMinPercent: wet() });
      notify({ kind: "success", title: `Threshold ${props.blockName} disimpan` });
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan threshold" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="font-semibold text-slate-900">{props.blockName}</h3>
          <Show when={props.regionName}>
            <p class="text-xs text-slate-400">{props.regionName}</p>
          </Show>
        </div>
        <button
          type="button"
          disabled={saving()}
          onClick={save}
          class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving() ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      <div class="flex flex-col gap-5">
        <RangeInput
          label="Ambang Kering (Irigasi ON jika di bawah ini)"
          value={dry()}
          min={10}
          max={90}
          onChange={(v) => { if (v < wet()) setDry(v); }}
        />
        <RangeInput
          label="Ambang Basah (Irigasi OFF jika di atas ini)"
          value={wet()}
          min={10}
          max={90}
          onChange={(v) => { if (v > dry()) setWet(v); }}
        />
        <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Irigasi aktif saat kelembaban &lt;{" "}
          <span class="font-semibold text-amber-600">{dry()}%</span>, berhenti saat &gt;{" "}
          <span class="font-semibold text-emerald-600">{wet()}%</span>
        </div>
      </div>
    </div>
  );
}

function SafetyTimeoutCard(props: { initialMin: number; initialMax: number }) {
  const { notify } = useToast();
  const [minVal, setMinVal] = createSignal(props.initialMin);
  const [maxVal, setMaxVal] = createSignal(props.initialMax);
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    if (minVal() >= maxVal()) {
      notify({ kind: "warning", title: "Durasi minimum harus lebih kecil dari maksimum" });
      return;
    }
    setSaving(true);
    try {
      await saveSafetyTimeout({ min: minVal(), max: maxVal() });
      notify({ kind: "success", title: "Safety timeout berhasil disimpan" });
    } catch {
      notify({ kind: "error", title: "Gagal menyimpan safety timeout" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="font-semibold text-slate-900">Safety Timeout</h3>
          <p class="text-sm text-slate-500">Batasi durasi irigasi otomatis untuk mencegah pemborosan air</p>
        </div>
        <button
          type="button"
          disabled={saving()}
          onClick={save}
          class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving() ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      <div class="flex flex-col gap-5">
        <RangeInput
          label="Durasi Minimum Irigasi"
          value={minVal()}
          min={1}
          max={60}
          unit=" menit"
          onChange={(v) => { if (v < maxVal()) setMinVal(v); }}
        />
        <RangeInput
          label="Durasi Maksimum Irigasi"
          value={maxVal()}
          min={1}
          max={120}
          unit=" menit"
          onChange={(v) => { if (v > minVal()) setMaxVal(v); }}
        />
        <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Irigasi otomatis berjalan minimal{" "}
          <span class="font-semibold text-sky-600">{minVal()} menit</span> dan maksimal{" "}
          <span class="font-semibold text-rose-600">{maxVal()} menit</span> per sesi
        </div>
      </div>
    </div>
  );
}

// ─── Role-specific settings views ────────────────────────────────────────────

function SuperadminSettings(props: { settings: Settings & { role: "SUPERADMIN" } }) {
  return (
    <>
      <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
        Sebagai Superadmin, Anda mengelola pengaturan sistem secara global. Untuk konfigurasi peta, kunjungi halaman{" "}
        <a href="/peta-konfigurasi" class="font-semibold underline">Konfigurasi Peta</a>.
      </div>
      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Keamanan Sistem Global</h2>
          <p class="text-sm text-slate-500">Batas waktu irigasi otomatis berlaku untuk seluruh sistem</p>
        </div>
        <div class="p-5">
          <SafetyTimeoutCard initialMin={props.settings.safetyTimeout.min} initialMax={props.settings.safetyTimeout.max} />
        </div>
      </div>
    </>
  );
}

function AdminSettings(props: { settings: Settings & { role: "ADMIN" } }) {
  return (
    <>
      {/* Block thresholds for all region blocks */}
      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Kontrol Irigasi — Blok Region Anda</h2>
          <p class="text-sm text-slate-500">Atur ambang batas kelembaban untuk semua blok di wilayah Anda</p>
        </div>
        <div class="grid gap-4 p-5 sm:grid-cols-2">
          <Show
            when={props.settings.blocks.length > 0}
            fallback={<div class="col-span-2 py-8 text-center text-sm text-slate-400">Belum ada blok di region Anda</div>}
          >
            <For each={props.settings.blocks}>
              {(block) => (
                <ThresholdCard
                  blockId={block.id}
                  blockName={block.name}
                  regionName={block.regionName}
                  initialDry={block.threshold?.dryMaxPercent ?? 40}
                  initialWet={block.threshold?.wetMinPercent ?? 70}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Safety timeout */}
      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Keamanan Sistem</h2>
        </div>
        <div class="p-5">
          <SafetyTimeoutCard initialMin={props.settings.safetyTimeout.min} initialMax={props.settings.safetyTimeout.max} />
        </div>
      </div>
    </>
  );
}

function UserSettings(props: { settings: Settings & { role: "USER" } }) {
  return (
    <>
      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Kontrol Irigasi</h2>
          <p class="text-sm text-slate-500">Atur ambang batas kelembaban per lahan untuk irigasi otomatis</p>
        </div>
        <div class="grid gap-4 p-5 sm:grid-cols-2">
          <Show
            when={props.settings.blocks.length > 0}
            fallback={<div class="col-span-2 py-8 text-center text-sm text-slate-400">Belum ada lahan yang ditugaskan</div>}
          >
            <For each={props.settings.blocks}>
              {(block) => (
                <ThresholdCard
                  blockId={block.id}
                  blockName={block.name}
                  regionName={block.regionName}
                  initialDry={block.threshold?.dryMaxPercent ?? 40}
                  initialWet={block.threshold?.wetMinPercent ?? 70}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Keamanan Sistem</h2>
          <p class="text-sm text-slate-500">Konfigurasi batas waktu operasi irigasi otomatis</p>
        </div>
        <div class="p-5">
          <SafetyTimeoutCard initialMin={props.settings.safetyTimeout.min} initialMax={props.settings.safetyTimeout.max} />
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Pengaturan() {
  const settings = createAsync(() => loadSettings());

  return (
    <>
      <Title>Pengaturan | Adosistering</Title>
      <Meta name="description" content="Pengaturan ambang batas kelembaban dan safety timeout irigasi otomatis." />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Pengaturan</h1>

        <Suspense fallback={<div class="flex flex-col gap-4"><SkCard /><SkCard /></div>}>
          <Show when={settings()}>
            {(s) => (
              <>
                <Show when={s().role === "SUPERADMIN"}>
                  <SuperadminSettings settings={s() as Settings & { role: "SUPERADMIN" }} />
                </Show>
                <Show when={s().role === "ADMIN"}>
                  <AdminSettings settings={s() as Settings & { role: "ADMIN" }} />
                </Show>
                <Show when={s().role === "USER"}>
                  <UserSettings settings={s() as Settings & { role: "USER" }} />
                </Show>
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
