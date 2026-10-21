import { createSignal, Show } from "solid-js";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { useToast } from "~/components/shared/ToastProvider";
import { createBlockFromMap } from "~/server/actions/map";
import type { BlockCreateResult } from "~/types/map";

const MAX_AREA_HECTARE = 99_999_999.99;
const UNSAFE_NAME_CHARACTERS = /[.#$/[\]]/;

const INPUT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border px-3 text-base text-slate-800 outline-none transition disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm";

function inputClass(hasError: boolean) {
  return `${INPUT_CLASS} ${
    hasError
      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
      : "border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
  }`;
}

function validateName(raw: string): string {
  const value = raw.trim();
  if (!value) return "Nama block wajib diisi.";
  if (value.length < 2) return "Nama minimal 2 karakter.";
  if (value.length > 100) return "Nama maksimal 100 karakter.";
  if (UNSAFE_NAME_CHARACTERS.test(value)) return "Nama tidak boleh mengandung karakter . # $ / [ ].";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return "Nama tidak boleh mengandung karakter kontrol.";
  }
  return "";
}

function normalizeAreaText(raw: string): string {
  let text = raw.trim().replace(",", ".");
  if (text.startsWith(".")) text = `0${text}`;
  if (text.endsWith(".")) text = text.slice(0, -1);
  return text;
}

function validateArea(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = normalizeAreaText(trimmed);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return "Luas area harus berupa angka dengan maksimal 2 angka desimal.";
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Luas area harus lebih besar dari 0.";
  if (numeric > MAX_AREA_HECTARE) return "Luas area maksimal 99.999.999,99 hektare.";
  return "";
}

export function BlockCreateModal(props: {
  region: { id: string; name: string };
  onClose: () => void;
  onCreated: (block: BlockCreateResult) => void;
}) {
  const { notify } = useToast();
  const [name, setName] = createSignal<string>("");
  const [area, setArea] = createSignal<string>("");
  const [nameError, setNameError] = createSignal<string>("");
  const [areaError, setAreaError] = createSignal<string>("");
  const [formError, setFormError] = createSignal<string>("");
  const [saving, setSaving] = createSignal<boolean>(false);

  const requestClose = () => {
    if (!saving()) props.onClose();
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving()) return;

    const nextNameError = validateName(name());
    const nextAreaError = validateArea(area());
    setNameError(nextNameError);
    setAreaError(nextAreaError);
    setFormError("");
    if (nextNameError || nextAreaError) return;

    setSaving(true);
    try {
      const created = await createBlockFromMap({
        regionId: props.region.id,
        name: name().trim(),
        areaHectare: area().trim() ? normalizeAreaText(area()) : undefined,
      });
      if (created.firebaseSyncStatus === "FAILED") {
        notify({
          kind: "warning",
          title: "Block tersimpan, sinkronisasi Firebase tertunda",
          message:
            "Block sudah tercatat di database, tetapi mirror Firebase gagal dibuat. Perangkat dapat memakai data sebelumnya sampai sinkronisasi berhasil.",
        });
      } else {
        notify({ kind: "success", title: `Block "${created.name}" berhasil dibuat` });
      }
      props.onCreated(created);
    } catch (error) {
      const serverMessage = error instanceof Response ? await error.text().catch(() => "") : "";
      const message = serverMessage || "Gagal membuat block. Periksa koneksi Anda lalu coba lagi.";
      setFormError(message);
      notify({ kind: "error", title: "Gagal membuat block", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame onClose={requestClose} titleId="block-create-title" panelClass="max-w-md p-6">
      <div>
        <h2 id="block-create-title" class="text-lg font-semibold text-slate-900">
          Tambah Block
        </h2>
        <p class="mt-1 text-sm text-slate-500">
          Block baru akan ditambahkan ke region ini dan disinkronkan ke Firebase.
        </p>

        <form class="mt-5 flex flex-col gap-4" onSubmit={save}>
          <div>
            <span class="mb-1 block text-xs font-medium text-slate-600">Region</span>
            <div class="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              <span class="min-w-0 break-words">{props.region.name}</span>
            </div>
          </div>

          <div>
            <label for="block-create-name" class="mb-1 block text-xs font-medium text-slate-600">
              Nama Block <span class="text-rose-500">*</span>
            </label>
            <input
              id="block-create-name"
              type="text"
              autocomplete="off"
              maxlength={100}
              value={name()}
              disabled={saving()}
              placeholder="Blok A"
              aria-invalid={nameError() ? "true" : "false"}
              aria-describedby={nameError() ? "block-create-name-error" : undefined}
              class={inputClass(Boolean(nameError()))}
              onInput={(event) => {
                setName(event.currentTarget.value);
                if (nameError()) setNameError("");
              }}
              onBlur={() => setNameError(validateName(name()))}
            />
            <Show when={nameError()}>
              <p id="block-create-name-error" class="mt-1 text-xs text-rose-600">
                {nameError()}
              </p>
            </Show>
          </div>

          <div>
            <label for="block-create-area" class="mb-1 block text-xs font-medium text-slate-600">
              Luas Area (hektare)
            </label>
            <input
              id="block-create-area"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              value={area()}
              disabled={saving()}
              placeholder="12,5"
              aria-invalid={areaError() ? "true" : "false"}
              aria-describedby={areaError() ? "block-create-area-error" : undefined}
              class={inputClass(Boolean(areaError()))}
              onInput={(event) => {
                setArea(event.currentTarget.value);
                if (areaError()) setAreaError("");
              }}
              onBlur={() => setAreaError(validateArea(area()))}
            />
            <p class="mt-1 text-xs text-slate-400">Opsional. Gunakan koma atau titik untuk desimal.</p>
            <Show when={areaError()}>
              <p id="block-create-area-error" class="mt-1 text-xs text-rose-600">
                {areaError()}
              </p>
            </Show>
          </div>

          <Show when={formError()}>
            <p role="alert" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {formError()}
            </p>
          </Show>

          <div class="mt-1 flex justify-end gap-3">
            <button
              type="button"
              disabled={saving()}
              onClick={requestClose}
              class="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving()}
              class="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving() ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
