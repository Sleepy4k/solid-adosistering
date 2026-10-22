import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { CalendarX } from "lucide-solid";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { useToast } from "~/components/shared/ToastProvider";
import { DatePicker } from "~/components/ui/DatePicker";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { ROUTES } from "~/constants/routes";
import { addJakartaDays, inclusiveJakartaDayCount, jakartaDateKey, startOfJakartaDay } from "~/lib/shared/datetime";
import { MAX_EXPORT_RANGE_DAYS } from "~/lib/shared/exportRange";

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV (.csv)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF (.pdf)" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "Semua data" },
  { value: "range", label: "Rentang tanggal" },
];

type ExportPreview = {
  count: number;
  maxRows: number;
  filename: string;
  format: string;
  exportedCount?: number;
  truncated?: boolean;
  order?: "newest-first" | "page-order";
};

const btnPrimary =
  "w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const btnGhost =
  "w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:w-auto";

function isAbortError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

function parseHeaderCount(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** WIB today and the start of the default one-month window ending today. */
function defaultRange() {
  const today = jakartaDateKey(new Date());
  const from = jakartaDateKey(addJakartaDays(startOfJakartaDay(today), -(MAX_EXPORT_RANGE_DAYS - 1)));
  return { from, to: today };
}

/**
 * Export dialog for the `/api/export/[dataset]` tables. Logs require a date
 * range of at most 31 days; lists default to every row and can optionally be
 * narrowed by creation date. The active page filters are sent along with the
 * request so the file matches what the page shows.
 */
export function ExportDataModal(props: {
  open: boolean;
  onClose: () => void;
  dataset: string;
  title: string;
  /** `required` for logs; `optional` lets the user export every row. */
  dateRange: "required" | "optional";
  /** What the date range filters on, e.g. `Tanggal dibuat`. */
  dateLabel: string;
  /** Page filters forwarded to the export (empty values are ignored). */
  filters?: Record<string, string | undefined>;
  /** Short note listing the page filters that will be applied. */
  filterNote?: string;
}) {
  const { notify } = useToast();
  const [view, setView] = createSignal<"form" | "empty">("form");
  const [period, setPeriod] = createSignal<"all" | "range">("range");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [format, setFormat] = createSignal("csv");
  const [loading, setLoading] = createSignal(false);
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
        setLoading(false);
        if (!open) {
          abortRequest();
          return;
        }
        const range = defaultRange();
        setFrom(range.from);
        setTo(range.to);
        setPeriod(props.dateRange === "required" ? "range" : "all");
        setFormat("csv");
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

  const usesRange = () => props.dateRange === "required" || period() === "range";

  const rangeError = createMemo(() => {
    if (!usesRange()) return "";
    if (!from() || !to()) return "Pilih tanggal mulai dan tanggal akhir.";
    const days = inclusiveJakartaDayCount(from(), to());
    if (!Number.isFinite(days)) return "Tanggal mulai tidak boleh setelah tanggal akhir.";
    if (days > MAX_EXPORT_RANGE_DAYS) return `Rentang tanggal maksimal ${MAX_EXPORT_RANGE_DAYS} hari (1 bulan).`;
    if (to() > jakartaDateKey(new Date())) return "Tanggal akhir tidak boleh melewati hari ini.";
    return "";
  });

  const emptyMessage = () =>
    usesRange()
      ? `Tidak ada data ${props.title.toLowerCase()} pada rentang ${from()} s/d ${to()}.`
      : `Belum ada data ${props.title.toLowerCase()} untuk diekspor.`;

  const buildParams = () => {
    const params = new URLSearchParams({ format: format() });
    if (usesRange()) {
      params.set("from", from());
      params.set("to", to());
    }
    for (const [key, value] of Object.entries(props.filters ?? {})) {
      if (value) params.set(key, value);
    }
    return params;
  };

  const exportUrl = (params: URLSearchParams) => `/api/export/${encodeURIComponent(props.dataset)}?${params}`;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (loading() || rangeError()) return;

    abortRequest();
    const controller = new AbortController();
    requestController = controller;
    const params = buildParams();
    params.set("preview", "1");

    setLoading(true);
    try {
      const response = await fetch(exportUrl(params), {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.location.assign(ROUTES.login);
        return;
      }
      if (!response.ok) {
        const message = (await response.text()).trim();
        notify({ kind: "error", title: "Gagal menyiapkan ekspor", message });
        return;
      }

      const preview = (await response.json()) as ExportPreview;
      if (preview.count === 0) {
        setView("empty");
        return;
      }
      const previewTruncated = preview.truncated ?? preview.count > preview.maxRows;

      // Fetch the file instead of navigating an `<a download>` so an error
      // response is reported instead of being saved under the file name.
      params.delete("preview");
      const download = await fetch(exportUrl(params), {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (download.status === 401) {
        window.location.assign(ROUTES.login);
        return;
      }
      if (!download.ok) {
        const message = (await download.text()).trim();
        const title =
          download.status === 503
            ? "Server sedang sibuk"
            : download.status === 404
              ? "Data tidak ditemukan"
              : "Gagal mengunduh ekspor";
        notify({ kind: "error", title, message });
        return;
      }

      const rowCount =
        parseHeaderCount(download.headers.get("X-Export-Row-Count")) ??
        preview.exportedCount ??
        Math.min(preview.count, preview.maxRows);
      const totalCount = parseHeaderCount(download.headers.get("X-Export-Total-Count")) ?? preview.count;
      const partial = download.headers.get("X-Export-Truncated") === "1" || previewTruncated;

      const blob = await download.blob();
      if (blob.size === 0) {
        notify({ kind: "error", title: "Gagal mengunduh ekspor", message: "Berkas ekspor kosong. Coba lagi." });
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
        const which = preview.order === "newest-first" ? "terbaru" : "pertama";
        notify({
          kind: "warning",
          title: "Ekspor dibatasi",
          message: `Berkas berisi ${rowCount} baris ${which} dari ${totalCount} baris.`,
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
                <h2 class="text-lg font-semibold text-slate-900">Export {props.title}</h2>
                <p class="mt-1 text-xs leading-5 text-slate-500">
                  {props.dateRange === "required"
                    ? `Pilih rentang tanggal (maksimal ${MAX_EXPORT_RANGE_DAYS} hari) dan format file yang akan diunduh.`
                    : "Ekspor semua data atau batasi berdasarkan tanggal, lalu pilih format file."}
                  <Show when={props.filterNote}> {props.filterNote}</Show>
                </p>
              </div>

              <Show when={props.dateRange === "optional"}>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-600">Periode</label>
                  <SimpleSelect
                    value={period()}
                    options={PERIOD_OPTIONS}
                    onChange={(value) => setPeriod(value === "range" ? "range" : "all")}
                  />
                </div>
              </Show>

              <Show when={usesRange()}>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">{props.dateLabel} dari</label>
                    <DatePicker value={from()} placeholder="Tanggal mulai" onChange={setFrom} />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Sampai</label>
                    <DatePicker value={to()} placeholder="Tanggal akhir" align="end" onChange={setTo} />
                  </div>
                </div>
                <Show when={rangeError()}>
                  <span class="-mt-2 text-xs text-rose-600">{rangeError()}</span>
                </Show>
              </Show>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-600">Format file</label>
                <SimpleSelect value={format()} options={FORMAT_OPTIONS} onChange={setFormat} />
                <p class="mt-1 text-[11px] leading-4 text-slate-500">
                  PDF maks 2.000 baris; CSV/Excel maks 5.000 baris.
                </p>
              </div>

              <div class="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button type="button" class={btnGhost} onClick={close}>
                  Batal
                </button>
                <button type="submit" class={btnPrimary} disabled={loading() || !!rangeError()}>
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
