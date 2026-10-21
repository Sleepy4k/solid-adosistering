import { query, createAsync } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, onMount, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { CalendarDays, Clock3, Download, Droplets, Gauge, Loader2, RotateCcw, WavesHorizontal } from "lucide-solid";
import { getIrrigationHistory, getMyBlocks } from "~/server/actions/history";
import { getMyRegions } from "~/server/actions/regions";
import { finishProgress, startProgress } from "~/lib/client/progress";
import { SkCard } from "~/components/shared/Skeleton";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { DatePicker } from "~/components/ui/DatePicker";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { useLiveDate } from "~/lib/client/liveDate";
import { ExportHistoryModal } from "~/features/history/ExportHistoryModal";
import { formatJakartaDateTime } from "~/lib/shared/datetime";

const loadBlocks = query(() => getMyBlocks(), "my-blocks");
const loadRegions = query(() => getMyRegions(), "my-regions");

export const route = { preload: () => loadBlocks() };

const PAGE_SIZE = 10;

type HistoryItem = Awaited<ReturnType<typeof getIrrigationHistory>>["items"][number];

function toMessage(error: unknown) {
  if (!import.meta.env.PROD && error instanceof Error) return error.message;
  return "Data riwayat belum bisa dimuat.";
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} detik`;
  if (rest === 0) return `${minutes} menit`;
  return `${minutes} menit ${rest} detik`;
}

function avgLmin(totalVolumeLiter: number | null, durationSeconds: number | null): string {
  if (totalVolumeLiter == null || durationSeconds == null || durationSeconds <= 0) return "-";
  const durationMin = durationSeconds / 60;
  return (totalVolumeLiter / durationMin).toFixed(2);
}

function statusMeta(event: HistoryItem) {
  if (event.relay === "ON" && !event.endedAt) return { label: "Irigasi Aktif", cls: "bg-emerald-100 text-emerald-700" };
  return { label: "Irigasi Selesai", cls: "bg-[#EAF5E7] text-[#186D3C]" };
}

function moistureClass(status?: string | null) {
  if (status === "KERING") return "text-red-600";
  if (status === "BASAH") return "text-blue-600";
  if (status === "LEMBAB") return "text-[#16A34A]";
  return "text-slate-500";
}

function moisturePercentText(sensor: HistoryItem["sensor"]): string {
  if (sensor?.moisturePercent == null) return "-";
  return `${sensor.moisturePercent.toFixed(2)}%`;
}

function moistureStatusLabel(status?: string | null): string {
  if (status === "KERING") return "Kering";
  if (status === "BASAH") return "Basah";
  if (status === "LEMBAB") return "Lembab";
  return "Tidak tersedia";
}

function totalVolumeText(value: number | null): string {
  return value == null ? "-" : `${value.toFixed(2)} L`;
}

export default function RiwayatIrigasi() {
  const confirm = useConfirm();
  const liveDate = useLiveDate();
  const [regionId, setRegionId] = createSignal<string>("");
  const [blockId, setBlockId] = createSignal<string>("");
  const [status, setStatus] = createSignal<string>("");
  const [dateFrom, setDateFrom] = createSignal<string>("");
  const [dateTo, setDateTo] = createSignal<string>("");
  const [loadError, setLoadError] = createSignal<string>("");

  const [items, setItems] = createSignal<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = createSignal<string | null>(null);
  const [hasMore, setHasMore] = createSignal(false);
  const [isFetching, setIsFetching] = createSignal(false);
  const [initialLoading, setInitialLoading] = createSignal(true);
  const [exportOpen, setExportOpen] = createSignal(false);

  const blocks = createAsync(() => loadBlocks());
  const regions = createAsync(() => loadRegions());

  const filteredBlocks = () => {
    const allBlocks = blocks() ?? [];
    const rid = regionId();
    if (!rid) return allBlocks;
    return allBlocks.filter((b) => b.region.id === rid);
  };

  let fetchSeq = 0;

  const fetchPage = async (isReset: boolean) => {
    if (!isReset && isFetching()) return;
    const mySeq = ++fetchSeq;
    setIsFetching(true);
    if (isReset) {
      setInitialLoading(true);
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
    }
    void startProgress();
    setLoadError("");
    try {
      const result = await getIrrigationHistory({
        regionId: regionId() || undefined,
        blockId: blockId() || undefined,
        status: (status() as "ON" | "OFF") || undefined,
        dateFrom: dateFrom() || undefined,
        dateTo: dateTo() || undefined,
        cursor: isReset ? undefined : (nextCursor() ?? undefined),
        limit: PAGE_SIZE,
      });
      if (mySeq !== fetchSeq) return;
      if (isReset) {
        setItems(result.items);
      } else {
        setItems((prev) => [...prev, ...result.items]);
      }
      setNextCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (error) {
      if (mySeq !== fetchSeq) return;
      setLoadError(toMessage(error));
    } finally {
      if (mySeq === fetchSeq) {
        setIsFetching(false);
        setInitialLoading(false);
      }
      void finishProgress();
    }
  };

  createEffect(
    on([regionId, blockId, status, dateFrom, dateTo], () => {
      void fetchPage(true);
    }),
  );

  let sentinel!: HTMLDivElement;
  onMount(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasMore() && !isFetching()) {
          void fetchPage(false);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  const reset = async () => {
    const ok = await confirm({
      title: "Reset Semua Filter?",
      message: "Semua filter yang sudah dipilih akan dikosongkan. Lanjutkan?",
      confirmLabel: "Ya, Reset",
      cancelLabel: "Batal",
    });
    if (!ok) return;
    setRegionId("");
    setBlockId("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <>
      <PageMeta page="irrigationHistory" />

      <div class="flex flex-col gap-5">
        <div class="rounded-2xl border border-[#C2C2C2] bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 class="text-xl font-bold text-[#4F4F4F] sm:text-2xl">Riwayat Irigasi</h1>
            <div class="flex flex-wrap items-center gap-2 sm:justify-end">
              <p class="inline-flex items-center gap-2 text-xs text-gray-500 sm:text-sm">
                <CalendarDays size={16} />
                {liveDate().toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <button
                type="button"
                class="btn-3d-green inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm font-medium text-white"
                onClick={() => setExportOpen(true)}
              >
                <Download size={16} />
                Export
              </button>
            </div>
          </div>
        </div>

        <Show when={loadError()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data belum bisa dimuat. {loadError()}
          </div>
        </Show>

        <div class="grid gap-4 rounded-2xl border border-[#C2C2C2] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Show when={(regions()?.length ?? 0) > 1}>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-[#4F4F4F]">Region</label>
              <SelectSearch
                value={regionId()}
                placeholder="Semua Region"
                options={[
                  { value: "", label: "Semua Region" },
                  ...(regions() ?? []).map((r) => ({ value: r.id, label: r.name })),
                ]}
                onChange={(value) => {
                  setRegionId(value);
                  setBlockId("");
                }}
              />
            </div>
          </Show>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Nama Lahan</label>
            <Suspense
              fallback={
                <div class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Memuat...</div>
              }
            >
              <SelectSearch
                value={blockId()}
                placeholder="Pilih nama lahan"
                options={[
                  { value: "", label: "Pilih nama lahan" },
                  ...filteredBlocks().map((block) => ({
                    value: block.id,
                    label: `${block.region.name} - ${block.name}`,
                  })),
                ]}
                onChange={setBlockId}
              />
            </Suspense>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Status Irigasi</label>
            <SimpleSelect
              value={status()}
              options={[
                { value: "", label: "Semua Status" },
                { value: "ON", label: "Nyala" },
                { value: "OFF", label: "Mati" },
              ]}
              onChange={setStatus}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Dari Tanggal</label>
            <DatePicker value={dateFrom()} placeholder="Dari tanggal" onChange={setDateFrom} />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Sampai Tanggal</label>
            <DatePicker value={dateTo()} placeholder="Sampai tanggal" onChange={setDateTo} />
          </div>

          <button
            type="button"
            class="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => void reset()}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

        <Show
          when={!initialLoading()}
          fallback={
            <div class="grid gap-4">
              <SkCard />
              <SkCard />
              <SkCard />
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="rounded-2xl border border-[#C2C2C2] bg-white p-10 text-center text-sm text-slate-500">
                Tidak ada data riwayat irigasi.
              </div>
            }
          >
            <div class="grid gap-4">
              <For each={items()}>
                {(event) => {
                  const evStatus = statusMeta(event);
                  const avgFlow = avgLmin(event.totalVolumeLiter, event.durationSeconds);
                  return (
                    <article class="animate-in overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div class="h-1 bg-[#67B744]" />
                      <div class="p-5">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div class="min-w-0">
                            <p class="text-sm font-semibold text-[#4F4F4F]">
                              {event.block.region.name} - {event.block.name}
                            </p>
                            <p class="text-sm font-medium text-[#4F8936]">{event.sprayer.displayName}</p>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <span class={`rounded-full px-3 py-1 text-xs font-semibold ${evStatus.cls}`}>
                              {evStatus.label}
                            </span>
                          </div>
                        </div>

                        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <WavesHorizontal size={15} /> Kelembaban
                            </p>
                            <p class={`text-sm font-semibold ${moistureClass(event.sensor?.moistureStatus)}`}>
                              {moisturePercentText(event.sensor)}
                            </p>
                          </div>
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Gauge size={15} /> Kondisi
                            </p>
                            <p class={`text-sm font-semibold ${moistureClass(event.sensor?.moistureStatus)}`}>
                              {moistureStatusLabel(event.sensor?.moistureStatus)}
                            </p>
                          </div>
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Clock3 size={15} /> Waktu
                            </p>
                            <p class="text-sm font-semibold text-[#4F4F4F]">{formatJakartaDateTime(event.startedAt)}</p>
                          </div>
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Clock3 size={15} /> Durasi
                            </p>
                            <p class="text-sm font-semibold text-[#4F4F4F]">{formatDuration(event.durationSeconds)}</p>
                          </div>
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4 sm:col-span-2 2xl:col-span-2">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Droplets size={15} /> Total &amp; Rata-rata Air
                            </p>
                            <div class="grid min-w-0 grid-cols-2 gap-3">
                              <div class="min-w-0">
                                <p class="text-[11px] text-[#6B7280]">Total</p>
                                <p class="text-sm font-semibold text-[#4F4F4F]">
                                  {totalVolumeText(event.totalVolumeLiter)}
                                </p>
                              </div>
                              <div class="min-w-0">
                                <p class="text-[11px] text-[#6B7280]">Rata-rata</p>
                                <p class="text-sm font-semibold text-[#4F4F4F]">
                                  {avgFlow} {avgFlow !== "-" ? "L/mnt" : ""}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="mt-4 flex flex-col gap-1 text-xs text-[#6B7280] sm:flex-row sm:items-center sm:justify-between">
                          <span>
                            {event.sensor
                              ? "Sensor mengikuti pembacaan terdekat dari waktu event."
                              : "Tidak ada pembacaan sensor terdekat untuk event ini."}
                          </span>
                          <span class="italic">Oleh {event.actor?.name ?? "Sistem otomatis"}</span>
                        </div>
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={isFetching() && !initialLoading()}>
          <div class="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 size={16} class="animate-spin" />
            Memuat lebih banyak…
          </div>
        </Show>

        <Show when={!hasMore() && items().length > 0 && !isFetching()}>
          <p class="py-4 text-center text-xs text-slate-400">Semua {items().length} data riwayat telah dimuat.</p>
        </Show>

        <div ref={sentinel} class="h-px" />
      </div>

      <ExportHistoryModal
        open={exportOpen()}
        onClose={() => setExportOpen(false)}
        regionId={regionId() || undefined}
        blockId={blockId() || undefined}
        status={status() || undefined}
      />
    </>
  );
}
