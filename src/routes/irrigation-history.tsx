import { query, createAsync } from "@solidjs/router";
import { createSignal, ErrorBoundary, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { CalendarDays, Clock3, Droplets, Gauge, RotateCcw, WavesHorizontal } from "lucide-solid";
import { getIrrigationHistory, getMyBlocks, getMyRegions } from "~/server/actions/index";
import { finishProgress, startProgress } from "~/lib/client/progress";
import { SkCard } from "~/components/shared/Skeleton";
import { SelectSearch } from "~/components/ui/SelectSearch";

const loadBlocks = query(() => getMyBlocks(), "my-blocks");
const loadRegions = query(() => getMyRegions(), "my-regions");
const loadHistory = query(
  (regionId: string, blockId: string, status: string, mode: string, dateFrom: string, dateTo: string) =>
    getIrrigationHistory({
      regionId: regionId || undefined,
      blockId: blockId || undefined,
      status: (status as "ON" | "OFF") || undefined,
      mode: (mode as "AUTO" | "MANUAL") || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  "irrigation-history",
);

export const route = { preload: () => loadBlocks() };

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Data riwayat belum bisa dimuat.";
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "-";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} detik`;
  return `${minutes} menit ${rest} detik`;
}

function avgLmin(totalVolumeLiter: number | null, durationSeconds: number | null): string {
  if (!totalVolumeLiter || !durationSeconds || durationSeconds === 0) return "-";
  const durationMin = durationSeconds / 60;
  return (totalVolumeLiter / durationMin).toFixed(2);
}

function statusMeta(event: Awaited<ReturnType<typeof getIrrigationHistory>>[number]) {
  if (event.relay === "ON" && !event.endedAt) return { label: "Irigasi Aktif", cls: "bg-emerald-100 text-emerald-700" };
  return { label: "Irigasi Selesai", cls: "bg-[#EAF5E7] text-[#186D3C]" };
}

function moistureClass(status?: string) {
  if (status === "KERING") return "text-red-600";
  if (status === "BASAH") return "text-blue-600";
  return "text-[#16A34A]";
}

export default function RiwayatIrigasi() {
  const [regionId, setRegionId] = createSignal<string>("");
  const [blockId, setBlockId] = createSignal<string>("");
  const [status, setStatus] = createSignal<string>("");
  const [mode, setMode] = createSignal<string>("");
  const [dateFrom, setDateFrom] = createSignal<string>("");
  const [dateTo, setDateTo] = createSignal<string>("");
  const [loadError, setLoadError] = createSignal<string>("");

  const blocks = createAsync(async () => {
    try {
      return await loadBlocks();
    } catch (error) {
      setLoadError(toMessage(error));
      return [];
    }
  });
  const regions = createAsync(() => loadRegions());

  const history = createAsync(async () => {
    setLoadError("");
    void startProgress();
    try {
      return await loadHistory(regionId(), blockId(), status(), mode(), dateFrom(), dateTo());
    } catch (error) {
      setLoadError(toMessage(error));
      return [];
    } finally {
      void finishProgress();
    }
  });

  const reset = () => {
    setRegionId("");
    setBlockId("");
    setStatus("");
    setMode("");
    setDateFrom("");
    setDateTo("");
  };

  const filteredBlocks = () => {
    const allBlocks = blocks() ?? [];
    const rid = regionId();
    if (!rid) return allBlocks;
    return allBlocks.filter((b) => b.region.id === rid);
  };

  return (
    <>
      <PageMeta page="irrigationHistory" />

      <div class="flex flex-col gap-5">
        <div class="rounded-2xl border border-[#C2C2C2] bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 class="text-xl font-bold text-[#4F4F4F] sm:text-2xl">Riwayat Irigasi</h1>
            <p class="inline-flex items-center gap-2 text-xs text-gray-500 sm:text-sm">
              <CalendarDays size={16} />
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <Show when={loadError()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data belum bisa dimuat. {loadError()}
          </div>
        </Show>

        <div class="grid gap-4 rounded-2xl border border-[#C2C2C2] bg-white p-5 sm:grid-cols-2 lg:grid-cols-6">
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
            <SelectSearch
              value={status()}
              placeholder="Pilih status"
              options={[
                { value: "", label: "Pilih status" },
                { value: "ON", label: "Nyala" },
                { value: "OFF", label: "Mati" },
              ]}
              onChange={setStatus}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Jenis Irigasi</label>
            <SelectSearch
              value={mode()}
              placeholder="Pilih jenis irigasi"
              options={[
                { value: "", label: "Pilih jenis irigasi" },
                { value: "AUTO", label: "Otomatis" },
                { value: "MANUAL", label: "Manual" },
              ]}
              onChange={setMode}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Dari Tanggal</label>
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={dateFrom()}
              onChange={(e) => setDateFrom(e.currentTarget.value)}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Sampai Tanggal</label>
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={dateTo()}
              onChange={(e) => setDateTo(e.currentTarget.value)}
            />
          </div>

          <button
            type="button"
            class="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 lg:col-start-6"
            onClick={reset}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p class="mb-3 text-sm text-red-700">
                {err instanceof Response ? "Gagal memuat riwayat irigasi." : String(err)}
              </p>
              <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
                Coba lagi
              </button>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div class="grid gap-4">
                <SkCard />
                <SkCard />
                <SkCard />
              </div>
            }
          >
            <Show
              when={(history() ?? []).length > 0}
              fallback={
                <div class="rounded-2xl border border-[#C2C2C2] bg-white p-10 text-center text-sm text-slate-500">
                  Tidak ada data riwayat irigasi dari Firebase.
                </div>
              }
            >
              <div class="grid gap-4">
                <For each={history()}>
                  {(event) => {
                    const evStatus = statusMeta(event);
                    const avgFlow = avgLmin(event.totalVolumeLiter, event.durationSeconds);
                    return (
                      <article class="animate-in overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        <div class="h-1 bg-[#67B744]" />
                        <div class="p-5">
                          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p class="text-sm font-semibold text-[#4F4F4F]">
                                {event.block.region.name} - {event.block.name}
                              </p>
                              <p class="text-sm font-medium text-[#4F8936]">{event.sprayer.displayName}</p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                              <span
                                class={`rounded-full px-3 py-1 text-xs font-semibold ${event.mode === "AUTO" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}
                              >
                                {event.mode === "AUTO" ? "Otomatis" : "Manual"}
                              </span>
                              <span class={`rounded-full px-3 py-1 text-xs font-semibold ${evStatus.cls}`}>
                                {evStatus.label}
                              </span>
                            </div>
                          </div>

                          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                              <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                                <WavesHorizontal size={15} /> Kelembaban
                              </p>
                              <p class={`text-sm font-semibold ${moistureClass(event.sensor?.moistureStatus)}`}>
                                {event.sensor?.moisturePercent?.toFixed(2) ?? "0.00"}%
                              </p>
                            </div>
                            <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                              <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                                <Gauge size={15} /> Kondisi
                              </p>
                              <p class={`text-sm font-semibold ${moistureClass(event.sensor?.moistureStatus)}`}>
                                {event.sensor?.moistureStatus === "KERING"
                                  ? "Kering"
                                  : event.sensor?.moistureStatus === "BASAH"
                                    ? "Basah"
                                    : "Lembab"}
                              </p>
                            </div>
                            <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                              <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                                <Clock3 size={15} /> Waktu
                              </p>
                              <p class="text-sm font-semibold text-[#4F4F4F]">{formatDate(event.startedAt)}</p>
                            </div>
                            <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                              <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                                <Clock3 size={15} /> Durasi
                              </p>
                              <p class="text-sm font-semibold text-[#4F4F4F]">
                                {formatDuration(event.durationSeconds)}
                              </p>
                            </div>
                            <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4 sm:col-span-2 xl:col-span-2">
                              <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                                <Droplets size={15} /> Total &amp; Rata-rata Air
                              </p>
                              <div class="grid grid-cols-2 gap-3">
                                <div>
                                  <p class="text-[11px] text-[#6B7280]">Total</p>
                                  <p class="text-sm font-semibold text-[#4F4F4F]">
                                    {event.totalVolumeLiter?.toFixed(2) ?? "0.00"} L
                                  </p>
                                </div>
                                <div>
                                  <p class="text-[11px] text-[#6B7280]">Rata-rata</p>
                                  <p class="text-sm font-semibold text-[#4F4F4F]">
                                    {avgFlow} {avgFlow !== "-" ? "L/mnt" : ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div class="mt-4 flex flex-col gap-1 text-xs text-[#6B7280] sm:flex-row sm:items-center sm:justify-between">
                            <span>Sensor mengikuti pembacaan terdekat dari waktu event.</span>
                            <span class="italic">Oleh {event.actor?.name ?? "Sistem otomatis"}</span>
                          </div>
                        </div>
                      </article>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
