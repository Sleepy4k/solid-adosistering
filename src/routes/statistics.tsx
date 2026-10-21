import { query, createAsync } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, Suspense } from "solid-js";
import { X } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { getMyRegions } from "~/server/actions/regions";
import { getStatistics } from "~/server/actions/statistics";
import { finishProgress, startProgress } from "~/lib/client/progress";
import { SkCard } from "~/components/shared/Skeleton";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { DatePicker } from "~/components/ui/DatePicker";
import {
  addJakartaDays,
  endOfJakartaDayExclusive,
  inclusiveJakartaDayCount,
  isValidDateOnly,
  jakartaDateKey,
  startOfJakartaDay,
} from "~/lib/shared/datetime";
import type { Chart as ChartType } from "chart.js";

type Range = "today" | "7d" | "30d";
type StatsResult = Awaited<ReturnType<typeof getStatistics>>;
type StatsArgs = { range: Range; dateFrom?: string; dateTo?: string; regionId?: string };

const PRESET_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30 };
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 31;

const loadStats = query(
  (args: StatsArgs) =>
    getStatistics({
      range: args.range,
      regionId: args.regionId || undefined,
      dateFrom: args.dateFrom || undefined,
      dateTo: args.dateTo || undefined,
    }),
  "statistics",
);
const loadRegions = query(() => getMyRegions(), "my-regions");
export const route = { preload: () => loadStats({ range: "today", regionId: "" }) };

function resolveWindow(args: StatsArgs): { from: Date; to: Date } {
  if (
    args.dateFrom &&
    args.dateTo &&
    isValidDateOnly(args.dateFrom) &&
    isValidDateOnly(args.dateTo) &&
    args.dateFrom <= args.dateTo
  ) {
    return { from: startOfJakartaDay(args.dateFrom), to: endOfJakartaDayExclusive(args.dateTo) };
  }

  const to = endOfJakartaDayExclusive(jakartaDateKey(new Date()));
  return { from: addJakartaDays(to, -PRESET_DAYS[args.range]), to };
}

function rangeError(from: string, to: string): string {
  if (!from && !to) return "";
  if (!from || !to) return "Lengkapi tanggal awal dan tanggal akhir.";
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) return "Format tanggal tidak valid.";
  const days = inclusiveJakartaDayCount(from, to);
  if (!Number.isFinite(days)) return "Tanggal awal tidak boleh melewati tanggal akhir.";
  if (days > MAX_RANGE_DAYS) return `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.`;
  return "";
}

function fallbackStats(args: StatsArgs): StatsResult {
  // An invalid custom range must never widen the request: fall back to the
  // preset window the user still has selected.
  const presetArgs: StatsArgs = { range: args.range, regionId: args.regionId };
  const { from, to } = resolveWindow(rangeError(args.dateFrom ?? "", args.dateTo ?? "") ? presetArgs : args);
  const fromIso = from.toISOString();
  return {
    granularity: to.getTime() - from.getTime() <= DAY_MS ? "2h" : "day",
    buckets: [],
    summary: {
      averageMoisture: null,
      averageFlow: null,
      totalFlow: 0,
      readingCount: 0,
      irrigationCount: 0,
      autoCount: 0,
      manualCount: 0,
    },
    since: fromIso,
    from: fromIso,
    to: to.toISOString(),
  };
}

function toMessage(error: unknown) {
  if (!import.meta.env.PROD && error instanceof Error) return error.message;
  return "Data statistik belum bisa dimuat.";
}

function StatBadge(props: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      class={`min-w-0 flex-1 basis-full rounded-xl p-5 text-white sm:basis-auto ${props.accent ? "bg-emerald-600" : "bg-emerald-500"}`}
    >
      <p class="text-sm opacity-90">{props.label}</p>
      <p class="mt-1 text-3xl font-bold">{props.value}</p>
      <Show when={props.sub}>
        <p class="mt-0.5 text-sm opacity-70">{props.sub}</p>
      </Show>
    </div>
  );
}

function MiniStat(props: { label: string; value: string; sub?: string; labelColor?: string }) {
  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <p class={`text-sm font-medium ${props.labelColor ?? "text-slate-500"}`}>{props.label}</p>
      <p class="mt-1 text-2xl font-bold text-slate-900">{props.value}</p>
      <Show when={props.sub}>
        <p class="text-xs text-slate-400">{props.sub}</p>
      </Show>
    </div>
  );
}

function LineChart(props: { labels: string[]; data: (number | null)[]; label: string; color: string; yMax: number }) {
  let canvas: HTMLCanvasElement | undefined;
  let chart: ChartType | undefined;
  let disposed = false;

  const syncChart = () => {
    if (!chart) return;
    chart.data.labels = [...props.labels];
    chart.data.datasets[0].data = [...props.data];
    const yScale = chart.options.scales?.y as { min?: number; max?: number } | undefined;
    if (yScale) {
      yScale.min = 0;
      yScale.max = props.yMax;
    }
    chart.update("none");
  };

  onMount(async () => {
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    if (disposed || !canvas) return;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: props.labels,
        datasets: [
          {
            label: props.label,
            data: props.data,
            borderColor: props.color,
            backgroundColor: `${props.color}22`,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: true,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } },
          y: { min: 0, max: props.yMax, beginAtZero: true, ticks: { font: { size: 10 } } },
        },
      },
    });
    syncChart();
  });

  createEffect(() => {
    props.labels;
    props.data;
    props.yMax;
    syncChart();
  });

  onCleanup(() => {
    disposed = true;
    chart?.destroy();
  });

  return (
    <div class="animate-in relative h-48 sm:h-56">
      <canvas ref={canvas} />
    </div>
  );
}

export default function Statistik() {
  const [range, setRange] = createSignal<Range>("today");
  const [dateFrom, setDateFrom] = createSignal<string>("");
  const [dateTo, setDateTo] = createSignal<string>("");
  const [regionId, setRegionId] = createSignal<string>("");
  const [loadError, setLoadError] = createSignal<string>("");

  const regions = createAsync(() => loadRegions());

  const rangeValidation = createMemo(() => rangeError(dateFrom(), dateTo()));

  const selectPreset = (preset: Range) => {
    setDateFrom("");
    setDateTo("");
    setRange(preset);
  };

  const clearRange = () => {
    setDateFrom("");
    setDateTo("");
  };

  const stats = createAsync(async () => {
    setLoadError("");
    const from = dateFrom();
    const to = dateTo();
    const args: StatsArgs =
      from && to
        ? { range: range(), regionId: regionId(), dateFrom: from, dateTo: to }
        : { range: range(), regionId: regionId() };

    // Never hit the server with half a custom range; the inline message explains why.
    if (rangeValidation()) return fallbackStats(args);

    void startProgress();
    try {
      return await loadStats(args);
    } catch (error) {
      setLoadError(toMessage(error));
      return fallbackStats(args);
    } finally {
      void finishProgress();
    }
  });

  const chartSeries = createMemo(() => {
    const buckets = stats()?.buckets ?? [];
    return {
      labels: buckets.map((bucket) => bucket.label),
      moisture: buckets.map((bucket) => bucket.averageMoisture),
      water: buckets.map((bucket) => bucket.averageFlow),
      hasData: (stats()?.summary.readingCount ?? 0) > 0,
    };
  });

  const summary = () => stats()?.summary;
  // An empty window is not a measurement: zeroes would read as real "0.00" and
  // "Kering" values, so every derived metric falls back to a dash instead.
  const hasReadings = () => (summary()?.readingCount ?? 0) > 0;
  const avgMoisture = () => summary()?.averageMoisture ?? null;
  const avgFlow = () => summary()?.averageFlow ?? null;
  const avgMoistureText = () => {
    const value = avgMoisture();
    return value === null || !hasReadings() ? "-" : `${value.toFixed(2)}%`;
  };
  const avgFlowText = () => {
    const value = avgFlow();
    return value === null || !hasReadings() ? "-" : value.toFixed(2);
  };
  const totalWaterText = () => {
    const value = summary()?.totalFlow;
    return value === undefined || !hasReadings() ? "-" : value.toFixed(2);
  };
  const moistureLabel = () => {
    const value = avgMoisture();
    if (value === null || !hasReadings()) return "Belum ada data";
    if (value <= 40) return "Kering";
    if (value >= 80) return "Basah";
    return "Lembab";
  };
  const irrigationCount = () => summary()?.irrigationCount ?? 0;
  const autoCount = () => summary()?.autoCount ?? 0;
  const manualCount = () => summary()?.manualCount ?? 0;
  const waterMax = () => {
    const values = chartSeries().water.filter((value): value is number => value !== null);
    return Math.max(1, ...values);
  };

  const rangeLabel: Record<Range, string> = { today: "Hari Ini", "7d": "7 Hari Terakhir", "30d": "30 Hari Terakhir" };
  const presetActive = (item: Range) => !dateFrom() && !dateTo() && range() === item;

  return (
    <>
      <PageMeta page="statistics" />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Statistik</h1>

        <Show when={loadError()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data belum bisa dimuat. {loadError()}
          </div>
        </Show>

        <div class="animate-in-soft rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex flex-wrap gap-1">
                {(["today", "7d", "30d"] as Range[]).map((item) => (
                  <button
                    type="button"
                    class={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${presetActive(item) ? "text-emerald-700 underline underline-offset-4" : "text-slate-500 hover:text-slate-800"}`}
                    onClick={() => selectPreset(item)}
                  >
                    {rangeLabel[item]}
                  </button>
                ))}
              </div>
              <Show when={(regions()?.length ?? 0) > 1}>
                <SelectSearch
                  value={regionId()}
                  placeholder="Semua Region"
                  options={[
                    { value: "", label: "Semua Region" },
                    ...(regions() ?? []).map((r) => ({ value: r.id, label: r.name })),
                  ]}
                  onChange={setRegionId}
                />
              </Show>
            </div>

            <div class="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
              <div class="flex w-full flex-col gap-1 sm:w-40">
                <label class="text-xs font-medium text-slate-500">Dari Tanggal</label>
                <DatePicker value={dateFrom()} placeholder="Dari tanggal" onChange={setDateFrom} />
              </div>
              <div class="flex w-full flex-col gap-1 sm:w-40">
                <label class="text-xs font-medium text-slate-500">Sampai Tanggal</label>
                <DatePicker value={dateTo()} placeholder="Sampai tanggal" onChange={setDateTo} />
              </div>
              <Show when={dateFrom() || dateTo()}>
                <button
                  type="button"
                  class="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:col-span-2 sm:w-40"
                  onClick={clearRange}
                >
                  <X size={14} />
                  Hapus rentang
                </button>
              </Show>
            </div>
          </div>

          <Show when={rangeValidation()}>
            <p class="mt-3 text-xs font-medium text-amber-600">{rangeValidation()}</p>
          </Show>
        </div>

        <Suspense
          fallback={
            <div class="grid gap-4 sm:grid-cols-2">
              <SkCard />
              <SkCard />
            </div>
          }
        >
          <div class="flex flex-wrap gap-4">
            <StatBadge label="Rata-rata Debit Air" value={avgFlowText()} sub="Liter/menit" />
            <StatBadge label="Kelembaban Rata Rata Keseluruhan" value={avgMoistureText()} accent />
          </div>

          <div class="animate-in-soft rounded-xl border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 class="font-semibold text-slate-900">Ringkasan Statistik</h2>
            </div>
            <div class="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat
                label="Frekuensi Irigasi Aktif"
                value={String(irrigationCount())}
                sub={`${autoCount()}x Otomatis - ${manualCount()}x Manual`}
                labelColor="text-amber-600"
              />
              <MiniStat label="Kelembaban Rata Rata" value={avgMoistureText()} sub={moistureLabel()} />
              <MiniStat label="Total Debit Tercatat" value={totalWaterText()} sub="L/mnt (jumlah pembacaan)" />
              <MiniStat label="Debit Air Rata Rata" value={avgFlowText()} sub="Liter/menit" />
            </div>

            <div class="grid gap-5 p-5 lg:grid-cols-2">
              <div class="rounded-xl border border-slate-100 p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h3 class="text-sm font-semibold text-slate-700">Kelembaban Tanah</h3>
                  <Show when={!chartSeries().hasData}>
                    <span class="text-xs text-slate-400">Belum ada data sensor</span>
                  </Show>
                </div>
                <LineChart
                  labels={chartSeries().labels}
                  data={chartSeries().moisture}
                  label="Kelembaban Tanah"
                  color="#10b981"
                  yMax={100}
                />
              </div>
              <div class="rounded-xl border border-slate-100 p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h3 class="text-sm font-semibold text-slate-700">Debit Air</h3>
                  <Show when={!chartSeries().hasData}>
                    <span class="text-xs text-slate-400">Belum ada data debit air</span>
                  </Show>
                </div>
                <LineChart
                  labels={chartSeries().labels}
                  data={chartSeries().water}
                  label="Debit Air (L/mnt)"
                  color="#3b82f6"
                  yMax={waterMax()}
                />
              </div>
            </div>
          </div>
        </Suspense>
      </div>
    </>
  );
}
