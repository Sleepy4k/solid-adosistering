import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { CalendarX, ChevronDown } from "lucide-solid";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { useToast } from "~/components/shared/ToastProvider";
import { ROUTES } from "~/constants/routes";
import { compareJakartaMonth, currentJakartaMonth, currentJakartaYear } from "~/lib/shared/datetime";

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

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV (.csv)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF (.pdf)" },
] as const;

type ExportFormat = (typeof FORMAT_OPTIONS)[number]["value"];

function isAbortError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

function currentMonthValue() {
  return String(Number(currentJakartaMonth().slice(5, 7)));
}

function parseHeaderCount(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const btnPrimary =
  "w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const btnGhost =
  "w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:w-auto";

type ExportPreview = {
  count: number;
  maxRows: number;
  filename: string;
  format: ExportFormat;
  exportedCount?: number;
  truncated?: boolean;
};

function initialMonthValue() {
  return currentMonthValue();
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
  const [format, setFormat] = createSignal<ExportFormat>("csv");
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
        setFormat("csv");
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

  // A past year exposes all 12 months; the current WIB year stops at the
  // current WIB month so a future month can never be selected.
  const monthOptions = () => {
    const current = currentJakartaMonth();
    return MONTH_OPTIONS.filter((option) => {
      const key = `${year()}-${option.value.padStart(2, "0")}`;
      return compareJakartaMonth(key, current) <= 0;
    });
  };

  const changeYear = (value: string) => {
    setYear(value);
    const current = currentJakartaMonth();
    const selected = `${value}-${month().padStart(2, "0")}`;
    if (compareJakartaMonth(selected, current) > 0) {
      setMonth(String(Number(current.slice(5, 7))));
    }
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
      format: format(),
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

      if (response.status === 400) {
        const message = (await response.text()).trim();
        notify({ kind: "error", title: message || "Periode ekspor tidak valid." });
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

      // The export endpoint caps the file at `maxRows` newest rows instead of
      // rejecting over-cap requests, so these values only describe a truncated
      // export and never block the download.
      const previewExportedCount = preview.exportedCount ?? Math.min(preview.count, preview.maxRows);
      const previewTruncated = preview.truncated ?? preview.count > preview.maxRows;

      params.delete("preview");
      params.set("format", preview.format);

      // Fetch the file instead of navigating an `<a download>`: anchor
      // navigation cannot observe a 401/404/413/503, so the browser could save
      // a text/plain error body under the export filename while the UI still
      // reports success.
      const downloadResponse = await fetch(`/api/irrigation-history/export?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      if (downloadResponse.status === 401) {
        window.location.assign(ROUTES.login);
        return;
      }

      if (!downloadResponse.ok) {
        const message = (await downloadResponse.text()).trim();
        const title =
          downloadResponse.status === 503
            ? "Server sedang sibuk"
            : downloadResponse.status === 413
              ? "Data ekspor terlalu banyak"
              : downloadResponse.status === 404
                ? "Data tidak ditemukan"
                : "Gagal mengunduh ekspor";
        notify({ kind: "error", title, message });
        return;
      }

      // Response headers are authoritative; preview values cover older servers
      // that do not emit them yet.
      const headerTruncated = downloadResponse.headers.get("X-Export-Truncated") === "1";
      const headerRowCount = parseHeaderCount(downloadResponse.headers.get("X-Export-Row-Count"));
      const headerTotalCount = parseHeaderCount(downloadResponse.headers.get("X-Export-Total-Count"));
      const rowCount = headerRowCount ?? previewExportedCount;
      const totalCount = headerTotalCount ?? preview.count;
      const partial = headerTruncated || previewTruncated;

      const blob = await downloadResponse.blob();
      if (blob.size === 0) {
        notify({
          kind: "error",
          title: "Gagal mengunduh ekspor",
          message: "Berkas ekspor kosong. Coba lagi.",
        });
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = preview.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the blob alive long enough for slower mobile browsers to save it.
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);

      props.onClose();
      if (partial) {
        notify({
          kind: "warning",
          title: "Ekspor dibatasi",
          message: `Berkas berisi ${rowCount} baris terbaru dari ${totalCount} baris.`,
        });
      } else {
        notify({ kind: "success", title: "Export dimulai" });
      }
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
                    "Pilih bulan, tahun, dan format file yang akan diunduh. Filter region, lahan, dan status yang aktif akan diterapkan."
                  }
                </p>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-600">Bulan</label>
                  <SimpleSelect value={month()} options={monthOptions()} onChange={setMonth} />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-600">Tahun</label>
                  <SimpleSelect value={year()} options={yearOptions()} align="end" onChange={changeYear} />
                </div>
              </div>

              <div>
                <label for="history-export-format" class="mb-1 block text-xs font-medium text-slate-600">
                  Format file
                </label>
                <div class="relative">
                  <select
                    id="history-export-format"
                    class="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={format()}
                    onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}
                  >
                    <For each={FORMAT_OPTIONS}>
                      {(option) => (
                        <option value={option.value} selected={option.value === format()}>
                          {option.label}
                        </option>
                      )}
                    </For>
                  </select>
                  <ChevronDown
                    size={14}
                    class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
                <p class="mt-1 text-[11px] leading-4 text-slate-500">
                  PDF maks 2.000 baris; CSV/Excel maks 5.000 baris. Jika data lebih banyak, hanya baris terbaru yang
                  diekspor.
                </p>
              </div>

              <div class="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
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
            <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
