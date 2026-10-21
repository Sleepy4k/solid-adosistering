import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { CalendarX } from "lucide-solid";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { useToast } from "~/components/shared/ToastProvider";
import { ROUTES } from "~/constants/routes";
import { currentJakartaMonth, currentJakartaYear } from "~/lib/shared/datetime";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({
  value: String(index + 1),
  label: name,
}));

function isAbortError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

const btnPrimary =
  "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

type ExportPreview = {
  count: number;
  maxRows: number;
  filename: string;
};

function initialMonthValue() {
  return String(Number(currentJakartaMonth().slice(5, 7)));
}

export function ExportHistoryModal(props: {
  open: boolean;
  onClose: () => void;
  regionId?: string;
  blockId?: string;
  status?: string;
}) {
  const { notify } = useToast();
  const [view, setView] = createSignal<"form" | "empty">("form");
  const [month, setMonth] = createSignal<string>(initialMonthValue());
  const [year, setYear] = createSignal<string>(String(currentJakartaYear()));
  const [loading, setLoading] = createSignal<boolean>(false);
  let requestController: AbortController | null = null;

  const abortRequest = () => {
    requestController?.abort();
    requestController = null;
  };

  createEffect(
    on(
      () => props.open,
      (open) => {
        setView("form");
        if (!open) {
          abortRequest();
          setLoading(false);
          return;
        }
        setMonth(initialMonthValue());
        setYear(String(currentJakartaYear()));
        setLoading(false);
      },
    ),
  );

  onCleanup(abortRequest);

  const close = () => {
    abortRequest();
    setLoading(false);
    setView("form");
    props.onClose();
  };

  const monthName = () => MONTH_NAMES[Number(month()) - 1] ?? "";
  const emptyMessage = () => `Data ekspor pada bulan ${monthName()} Tahun ${year()} tidak ada.`;
  // Derived per read so the 2020..current range rolls over with the WIB year
  // instead of freezing at module load.
  const yearOptions = () => {
    const currentYear = currentJakartaYear();
    return Array.from({ length: Math.max(currentYear - 2019, 1) }, (_, index) => {
      const value = String(currentYear - index);
      return { value, label: value };
    });
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (loading()) return;

    abortRequest();
    const controller = new AbortController();
    requestController = controller;

    const monthKey = `${year()}-${month().padStart(2, "0")}`;
    const params = new URLSearchParams({
      month: monthKey,
      preview: "1",
    });
    if (props.regionId) params.set("regionId", props.regionId);
    if (props.blockId) params.set("blockId", props.blockId);
    if (props.status) params.set("status", props.status);

    setLoading(true);
    try {
      const response = await fetch(`/api/irrigation-history/export?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 401) {
        window.location.assign(ROUTES.login);
        return;
      }

      if (response.status === 413) {
        const message = (await response.text()).trim();
        notify({ kind: "error", title: message || "Ukuran ekspor melebihi batas." });
        return;
      }

      if (!response.ok) {
        notify({ kind: "error", title: "Gagal menyiapkan ekspor" });
        return;
      }

      const preview = (await response.json()) as ExportPreview;

      if (preview.count === 0) {
        setView("empty");
        return;
      }

      if (preview.count > preview.maxRows) {
        notify({
          kind: "error",
          title: "Data ekspor terlalu banyak",
          message: `Maksimal ${preview.maxRows} baris. Persempit periode atau filter lalu coba lagi.`,
        });
        return;
      }

      params.delete("preview");
      const link = document.createElement("a");
      link.href = `/api/irrigation-history/export?${params.toString()}`;
      link.download = preview.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      props.onClose();
      notify({ kind: "success", title: "Export dimulai" });
    } catch (error) {
      if (isAbortError(error)) return;
      notify({ kind: "error", title: "Gagal menyiapkan ekspor" });
    } finally {
      if (requestController === controller) {
        requestController = null;
        setLoading(false);
      }
    }
  };

  return (
    <Show when={props.open}>
      <ModalFrame onClose={close} panelClass="max-w-md p-6">
        <Show
          when={view() === "empty"}
          fallback={
            <form onSubmit={submit} class="flex flex-col gap-4">
              <div>
                <h2 class="text-lg font-semibold text-slate-900">Export Riwayat Irigasi</h2>
                <p class="mt-1 text-xs leading-5 text-slate-500">
                  {
                    "Pilih bulan dan tahun data yang akan diunduh. Filter region, lahan, dan status yang aktif akan diterapkan."
                  }
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-600">Bulan</label>
                  <SimpleSelect value={month()} options={MONTH_OPTIONS} onChange={setMonth} />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-600">Tahun</label>
                  <SimpleSelect value={year()} options={yearOptions()} onChange={setYear} />
                </div>
              </div>

              <div class="flex justify-end gap-3 pt-1">
                <button type="button" class={btnGhost} onClick={close}>
                  Batal
                </button>
                <button type="submit" class={btnPrimary} disabled={loading()}>
                  {loading() ? "Menyiapkan..." : "Export"}
                </button>
              </div>
            </form>
          }
        >
          <div class="text-center">
            <div class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-500">
              <CalendarX size={24} aria-hidden="true" />
            </div>
            <h2 class="text-lg font-semibold text-slate-900">Data Tidak Ditemukan</h2>
            <p class="mt-2 text-sm leading-6 text-slate-500">{emptyMessage()}</p>
            <div class="mt-6 flex justify-end gap-3">
              <button type="button" class={btnPrimary} onClick={() => setView("form")}>
                Ubah Periode
              </button>
              <button type="button" class={btnGhost} onClick={close}>
                Tutup
              </button>
            </div>
          </div>
        </Show>
      </ModalFrame>
    </Show>
  );
}
