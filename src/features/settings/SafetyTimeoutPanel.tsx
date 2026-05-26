import { createEffect, createSignal } from "solid-js";
import { useToast } from "~/components/shared/ToastProvider";
import { DualRange } from "~/components/ui/DualRange";
import { EditButton } from "~/components/ui/EditButton";

function clampTimeout(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

export function SafetyTimeoutPanel(props: {
  initialMin: number;
  initialMax: number;
  onSave: (min: number, max: number) => Promise<unknown>;
  note?: string;
}) {
  const { notify } = useToast();
  const [editing, setEditing] = createSignal<boolean>(false);
  const [minVal, setMinVal] = createSignal<number>(clampTimeout(props.initialMin));
  const [maxVal, setMaxVal] = createSignal<number>(clampTimeout(props.initialMax));
  const [saving, setSaving] = createSignal<boolean>(false);

  createEffect(() => {
    setMinVal(clampTimeout(props.initialMin));
    setMaxVal(clampTimeout(props.initialMax));
  });

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
      await props.onSave(minVal(), maxVal());
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
            {props.note ?? "Fitur ini memastikan irigasi aktif dapat dimatikan otomatis saat alat tidak mengirim data."}
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
