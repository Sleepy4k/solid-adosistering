import { cache, createAsync } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { CalendarDays, Clock3, Droplets, Gauge, RotateCcw, Waves } from "lucide-solid";
import { getIrrigationHistory, getMyBlocks } from "~/server/actions/index";
import { finishProgress, startProgress } from "~/lib/client/progress";
import { SkCard } from "~/components/shared/Skeleton";

const loadBlocks = cache(() => getMyBlocks(), "my-blocks");
const loadHistory = cache(
  (blockId: string, status: string, mode: string, date: string) =>
    getIrrigationHistory({
      blockId: blockId || undefined,
      status: (status as "ON" | "OFF") || undefined,
      mode: (mode as "AUTO" | "MANUAL") || undefined,
      date: date || undefined,
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
  const [blockId, setBlockId] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [mode, setMode] = createSignal("");
  const [date, setDate] = createSignal("");
  const [loadError, setLoadError] = createSignal("");

  const blocks = createAsync(async () => {
    try {
      return await loadBlocks();
    } catch (error) {
      setLoadError(toMessage(error));
      return [];
    }
  });
  const history = createAsync(async () => {
    setLoadError("");
    void startProgress();
    try {
      return await loadHistory(blockId(), status(), mode(), date());
    } catch (error) {
      setLoadError(toMessage(error));
      return [];
    } finally {
      void finishProgress();
    }
  });

  const reset = () => {
    setBlockId("");
    setStatus("");
    setMode("");
    setDate("");
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

        <div class="grid gap-4 rounded-2xl border border-[#C2C2C2] bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Nama Lahan</label>
            <Suspense
              fallback={
                <select class="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option>Memuat…</option>
                </select>
              }
            >
              <select
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={blockId()}
                onChange={(e) => setBlockId(e.currentTarget.value)}
              >
                <option value="">Pilih nama lahan</option>
                <For each={blocks()}>{(block) => <option value={block.id}>{block.name}</option>}</For>
              </select>
            </Suspense>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Status Irigasi</label>
            <select
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={status()}
              onChange={(e) => setStatus(e.currentTarget.value)}
            >
              <option value="">Pilih status</option>
              <option value="ON">Nyala</option>
              <option value="OFF">Mati</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Jenis Irigasi</label>
            <select
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={mode()}
              onChange={(e) => setMode(e.currentTarget.value)}
            >
              <option value="">Pilih jenis irigasi</option>
              <option value="AUTO">Otomatis</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[#4F4F4F]">Tanggal</label>
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={date()}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
          </div>

          <button
            type="button"
            class="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            onClick={reset}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

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
                  const status = statusMeta(event);
                  return (
                    <article class="animate-in overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div class="h-1 bg-[#67B744]" />
                      <div class="p-5">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p class="text-sm text-[#6B7280]">{event.block.region.name}</p>
                            <h2 class="text-lg font-bold text-[#4F4F4F]">{event.block.name}</h2>
                            <p class="text-sm font-medium text-[#4F8936]">{event.sprayer.displayName}</p>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <span
                              class={`rounded-full px-3 py-1 text-xs font-semibold ${event.mode === "AUTO" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}
                            >
                              {event.mode === "AUTO" ? "Otomatis" : "Manual"}
                            </span>
                            <span class={`rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>

                        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Waves size={15} /> Kelembaban
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
                            <p class="text-sm font-semibold text-[#4F4F4F]">{formatDuration(event.durationSeconds)}</p>
                          </div>
                          <div class="rounded-xl border border-[#DDECD7] bg-[#F7FBF5] p-4">
                            <p class="mb-1 inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                              <Droplets size={15} /> Total Air
                            </p>
                            <p class="text-sm font-semibold text-[#4F4F4F]">
                              {event.totalVolumeLiter?.toFixed(2) ?? "0.00"} L
                              <span class="ml-2 text-xs font-medium text-[#6B7280]">
                                {event.sensor?.flowLmin?.toFixed(2) ?? "0.00"} L/m
                              </span>
                            </p>
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
      </div>
    </>
  );
}
