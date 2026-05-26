import { createSignal } from "solid-js";
import { Button } from "~/components/ui/Button";
import { useToast } from "~/components/shared/ToastProvider";
import type { getRegionsForConfig } from "~/server/actions/index";
import { updateRegionConfig } from "~/server/actions/index";

type RegionRow = Awaited<ReturnType<typeof getRegionsForConfig>>[number];

export function RegionConfigRow(props: { region: RegionRow; onSaved: () => void }) {
  const { notify } = useToast();
  const [divider, setDivider] = createSignal<string>(String(Number(props.region.volumeDivider)));
  const [wind, setWind] = createSignal<boolean>(props.region.showWindDirection);
  const [autoIrrig, setAutoIrrig] = createSignal<boolean>(props.region.showAutoIrrigation);
  const [saving, setSaving] = createSignal<boolean>(false);

  const save = async () => {
    const val = parseFloat(divider());
    if (!Number.isFinite(val) || val <= 0) {
      notify({ kind: "error", title: "Volume divider harus berupa angka positif." });
      return;
    }
    setSaving(true);
    try {
      await updateRegionConfig({
        id: props.region.id,
        volumeDivider: val,
        showWindDirection: wind(),
        showAutoIrrigation: autoIrrig(),
      });
      notify({ kind: "success", title: "Konfigurasi region disimpan." });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr class="border-b border-gray-100 last:border-0">
      <td class="px-5 py-4 font-medium text-[#333]">{props.region.name}</td>
      <td class="px-5 py-4">
        <input
          type="number"
          min="0.0001"
          step="any"
          value={divider()}
          onInput={(e) => setDivider(e.currentTarget.value)}
          class="form-input h-9 w-28 rounded-lg text-sm"
        />
      </td>
      <td class="px-5 py-4">
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={wind()}
            onChange={(e) => setWind(e.currentTarget.checked)}
            class="h-4 w-4 rounded accent-emerald-600"
          />
          <span class="text-sm text-[#4F4F4F]">Tampilkan</span>
        </label>
      </td>
      <td class="px-5 py-4">
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoIrrig()}
            onChange={(e) => setAutoIrrig(e.currentTarget.checked)}
            class="h-4 w-4 rounded accent-emerald-600"
          />
          <span class="text-sm text-[#4F4F4F]">Aktifkan</span>
        </label>
      </td>
      <td class="px-5 py-4">
        <Button tone="primary" class="h-8 px-3 text-xs" disabled={saving()} onClick={save}>
          {saving() ? "Menyimpan..." : "Simpan"}
        </Button>
      </td>
    </tr>
  );
}
