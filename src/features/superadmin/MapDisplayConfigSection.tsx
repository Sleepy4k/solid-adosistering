import { createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, Suspense } from "solid-js";
import { Card, CardHeader } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { useToast } from "~/components/shared/ToastProvider";
import { saveMapDisplayConfig } from "~/server/actions/index";
import { loadMapDisplayConfig } from "./loaders";
import type { MapDisplayConfig } from "~/types/map";

export function MapDisplayConfigSection() {
  const { notify } = useToast();
  const config = createAsync(() => loadMapDisplayConfig());
  const [keringColor, setKeringColor] = createSignal<string>("#ef4444");
  const [lembabColor, setLembabColor] = createSignal<string>("#facc15");
  const [basahColor, setBasahColor] = createSignal<string>("#3b82f6");
  const [initialized, setInitialized] = createSignal<boolean>(false);
  const [saving, setSaving] = createSignal<boolean>(false);

  const ensureInit = (cfg: MapDisplayConfig) => {
    if (initialized()) return;
    setKeringColor(cfg.keringColor);
    setLembabColor(cfg.lembabColor);
    setBasahColor(cfg.basahColor);
    setInitialized(true);
  };

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveMapDisplayConfig({ keringColor: keringColor(), lembabColor: lembabColor(), basahColor: basahColor() });
      notify({ kind: "success", title: "Konfigurasi map disimpan." });
      await revalidate("superadmin-map-display-config");
      await revalidate("map-display-config");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan konfigurasi map.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  const colorField = (label: string, value: string, onInput: (value: string) => void) => (
    <div class="flex flex-col gap-1.5">
      <label class="form-label text-xs">{label}</label>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onInput={(e) => onInput(e.currentTarget.value)}
          class="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 p-1"
        />
        <input
          value={value}
          onInput={(e) => onInput(e.currentTarget.value)}
          class="form-input h-10 flex-1 rounded-lg text-sm"
        />
      </div>
    </div>
  );

  return (
    <Card class="overflow-hidden">
      <CardHeader title="Konfigurasi Map" />
      <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
        <Show when={config()}>
          {(cfg) => {
            ensureInit(cfg());
            return (
              <form onSubmit={save} class="grid gap-5 p-5 sm:grid-cols-3">
                {colorField("Kering", keringColor(), setKeringColor)}
                {colorField("Lembab", lembabColor(), setLembabColor)}
                {colorField("Basah", basahColor(), setBasahColor)}
                <div class="flex justify-end sm:col-span-3">
                  <Button type="submit" tone="primary" disabled={saving()}>
                    {saving() ? "Menyimpan..." : "Simpan Konfigurasi Map"}
                  </Button>
                </div>
              </form>
            );
          }}
        </Show>
      </Suspense>
    </Card>
  );
}
