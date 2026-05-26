import { createSignal } from "solid-js";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { useToast } from "~/components/shared/ToastProvider";
import type { getRegions } from "~/server/actions/index";
import { createRegion, updateRegion } from "~/server/actions/index";

type RegionRow = Awaited<ReturnType<typeof getRegions>>[number];

const inputCls =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 w-full";

export function RegionModal(props: { initial?: RegionRow; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [name, setName] = createSignal<string>(props.initial?.name ?? "");
  const [desc, setDesc] = createSignal<string>(props.initial?.description ?? "");
  const [lat, setLat] = createSignal<string>(props.initial?.latitude?.toString() ?? "");
  const [lng, setLng] = createSignal<string>(props.initial?.longitude?.toString() ?? "");
  const [saving, setSaving] = createSignal<boolean>(false);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const latitude = lat().trim() || null;
      const longitude = lng().trim() || null;
      const parsedLatitude = latitude === null ? null : Number(latitude);
      const parsedLongitude = longitude === null ? null : Number(longitude);
      if (
        (parsedLatitude !== null && !Number.isFinite(parsedLatitude)) ||
        (parsedLongitude !== null && !Number.isFinite(parsedLongitude))
      ) {
        throw new Response("Koordinat region tidak valid.", { status: 400 });
      }
      if (props.initial) {
        await updateRegion({
          id: props.initial.id,
          name: name(),
          description: desc() || undefined,
          latitude,
          longitude,
        });
      } else {
        await createRegion({ name: name(), description: desc() || undefined, latitude, longitude });
      }
      notify({ kind: "success", title: `Region "${name()}" berhasil ${props.initial ? "diperbarui" : "dibuat"}` });
      props.onSaved();
      props.onClose();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan region";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto p-6">
      <>
        <h2 class="mb-5 text-lg font-semibold text-slate-900">{props.initial ? "Edit Region" : "Tambah Region"}</h2>
        <form onSubmit={save} class="flex flex-col gap-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">
              Nama Region <span class="text-rose-500">*</span>
            </label>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class={inputCls} required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Deskripsi</label>
            <input value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} class={inputCls} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600">Latitude</label>
              <input
                type="number"
                step="0.0000000000000001"
                value={lat()}
                onInput={(e) => setLat(e.currentTarget.value)}
                class={inputCls}
                placeholder="-7.6116625887708010"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600">Longitude</label>
              <input
                type="number"
                step="0.0000000000000001"
                value={lng()}
                onInput={(e) => setLng(e.currentTarget.value)}
                class={inputCls}
                placeholder="109.1770180391451000"
              />
            </div>
          </div>
          <p class="text-xs text-amber-600">Menyimpan region akan otomatis melakukan sinkronisasi ke Firebase RTDB.</p>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving()}
              class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving() ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}
