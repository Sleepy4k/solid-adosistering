import { createEffect, createSignal, For, on, Show } from "solid-js";
import { saveThreshold } from "~/server/actions/index";
import { useToast } from "~/components/shared/ToastProvider";
import { DualRange } from "~/components/ui/DualRange";
import { EditButton } from "~/components/ui/EditButton";
import type { Preference, SettingsRegion } from "./types";

const preferenceLabels: Record<Preference, string> = {
  KERING: "Kering",
  LEMBAB: "Lembab",
  BASAH: "Basah",
};

export function IrrigationControl(props: { region: SettingsRegion; readOnly?: boolean }) {
  const { notify } = useToast();
  const [editing, setEditing] = createSignal<boolean>(false);
  const [dry, setDry] = createSignal<number>(props.region.threshold?.dryMaxPercent ?? 40);
  const [wet, setWet] = createSignal<number>(props.region.threshold?.wetMinPercent ?? 80);
  const [preference, setPreference] = createSignal<Preference>(props.region.threshold?.landPreference ?? "LEMBAB");
  const [displayDry, setDisplayDry] = createSignal<number>(props.region.threshold?.displayDryMaxPercent ?? 40);
  const [displayMoist, setDisplayMoist] = createSignal<number>(props.region.threshold?.displayMoistMaxPercent ?? 70);
  const [displayWet, setDisplayWet] = createSignal<number>(props.region.threshold?.displayWetMinPercent ?? 80);
  const [saving, setSaving] = createSignal<boolean>(false);

  const reset = () => {
    setDry(props.region.threshold?.dryMaxPercent ?? 40);
    setWet(props.region.threshold?.wetMinPercent ?? 80);
    setPreference(props.region.threshold?.landPreference ?? "LEMBAB");
    setDisplayDry(props.region.threshold?.displayDryMaxPercent ?? 40);
    setDisplayMoist(props.region.threshold?.displayMoistMaxPercent ?? 70);
    setDisplayWet(props.region.threshold?.displayWetMinPercent ?? 80);
  };

  createEffect(
    on(
      () => props.region.id,
      () => {
        reset();
        setEditing(false);
      },
    ),
  );

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
        <Show when={!props.readOnly}>
          <EditButton editing={editing()} onClick={() => setEditing((value) => !value)} />
        </Show>
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
          <Show when={!props.readOnly}>
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
          </Show>
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
          <Show when={!props.readOnly}>
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
          </Show>
        </div>
      </div>
    </div>
  );
}
