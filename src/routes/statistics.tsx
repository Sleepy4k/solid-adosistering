import { query, createAsync } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, Suspense } from "solid-js";
import { ChartBar, Activity } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { getMyRegions, getStatistics } from "~/server/actions/index";
import { finishProgress, startProgress } from "~/lib/client/progress";
import { SkCard } from "~/components/shared/Skeleton";
import { SelectSearch } from "~/components/ui/SelectSearch";
import type { Chart as ChartType } from "chart.js";

type Range = "today" | "7d" | "30d";
type DataMode = "raw" | "smooth";
type Reading = Awaited<ReturnType<typeof getStatistics>>["readings"][number];

const loadStats = query(
  (range: Range, regionId: string) => getStatistics({ range, regionId: regionId || undefined }),
  "statistics",
);
const loadRegions = query(() => getMyRegions(), "my-regions");
export const route = { preload: () => loadStats("today", "") };

function StatBadge(props: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div class={`flex-1 rounded-xl p-5 text-white ${props.accent ? "bg-emerald-600" : "bg-emerald-500"}`}>
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

function LineChart(props: { labels: string[]; data: number[]; label: string; color: string; yMax: number }) {
  let canvas: HTMLCanvasElement | undefined;
  let chart: ChartType | undefined;

  const syncChart = () => {
    if (!chart) return;
    chart.data.labels = [...props.labels];
    chart.data.datasets[0].data = [...props.data];
    const yScale = chart.options.scales?.y as { min?: number; max?: number } | undefined;
    if (yScale) {
      yScale.min = 0;
      yScale.max = props.yMax;
    }
    chart.update();
  };

  onMount(async () => {
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    if (!canvas) return;
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

  onCleanup(() => chart?.destroy());

  return (
    <div class="animate-in relative h-48">
      <canvas ref={canvas} />
    </div>
  );
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTimeSlots(range: Range) {
  if (range === "today") {
    return {
      labels: Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`),
      keys: Array.from({ length: 12 }, (_, i) => String(i).padStart(2, "0")),
    };
  }

  const days = range === "7d" ? 7 : 30;
  const dates = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - i));
    return date;
  });
  return {
    labels: dates.map((date) => date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })),
    keys: dates.map(dateKey),
  };
}

function bucketIndex(range: Range, reading: Reading, keys: string[]) {
  const date = new Date(reading.recordedAt);
  if (range === "today") {
    if (dateKey(date) !== dateKey(new Date())) return -1;
    return Math.floor(date.getHours() / 2);
  }
  return keys.indexOf(dateKey(date));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function interpolateZeros(values: number[]): number[] {
  const result = [...values];
  let i = 0;
  while (i < result.length) {
    if (result[i] !== 0) {
      i++;
      continue;
    }
    let prevIdx = i - 1;
    while (prevIdx >= 0 && result[prevIdx] === 0) prevIdx--;
    let nextIdx = i + 1;
    while (nextIdx < result.length && result[nextIdx] === 0) nextIdx++;
    const prevVal = prevIdx >= 0 ? result[prevIdx] : nextIdx < result.length ? result[nextIdx] : 0;
    const nextVal = nextIdx < result.length ? result[nextIdx] : prevVal;
    const span = nextIdx - (prevIdx >= 0 ? prevIdx : 0);
    for (let j = (prevIdx >= 0 ? prevIdx : 0) + 1; j < nextIdx; j++) {
      const t = span > 0 ? (j - (prevIdx >= 0 ? prevIdx : 0)) / span : 0;
      result[j] = prevVal + t * (nextVal - prevVal);
    }
    i = nextIdx;
  }
  return result;
}

function smooth(values: number[]) {
  const n = values.length;
  if (n < 2) return [...values];
  const filled = interpolateZeros(values);
  const weights = [0.05, 0.25, 0.4, 0.25, 0.05];
  return filled.map((_, i) => {
    let sum = 0;
    let wsum = 0;
    for (let k = -2; k <= 2; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= n) continue;
      const w = weights[k + 2];
      sum += filled[idx] * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : filled[i];
  });
}

function waterValue(reading: Reading) {
  return Number(reading.totalVolumeLiter ?? reading.flowLmin ?? 0);
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Data statistik belum bisa dimuat.";
}

export default function Statistik() {
  const [range, setRange] = createSignal<Range>("today");
  const [dataMode, setDataMode] = createSignal<DataMode>("raw");
  const [regionId, setRegionId] = createSignal<string>("");
  const [loadError, setLoadError] = createSignal<string>("");

  const regions = createAsync(() => loadRegions());

  const stats = createAsync(async () => {
    setLoadError("");
    void startProgress();
    try {
      return await loadStats(range(), regionId());
    } catch (error) {
      setLoadError(toMessage(error));
      return { readings: [], events: [], since: new Date().toISOString() } as Awaited<ReturnType<typeof getStatistics>>;
    } finally {
      void finishProgress();
    }
  });

  const chartSeries = createMemo(() => {
    const slots = buildTimeSlots(range());
    const buckets = slots.labels.map(() => ({ moisture: [] as number[], water: [] as number[] }));

    for (const reading of stats()?.readings ?? []) {
      const index = bucketIndex(range(), reading, slots.keys);
      if (index < 0 || index >= buckets.length) continue;
      buckets[index].moisture.push(Number(reading.moisturePercent ?? 0));
      buckets[index].water.push(waterValue(reading));
    }

    const moisture = buckets.map((bucket) => average(bucket.moisture));
    const water = buckets.map((bucket) => average(bucket.water));
    return {
      labels: slots.labels,
      moisture: dataMode() === "smooth" ? smooth(moisture) : moisture,
      water: dataMode() === "smooth" ? smooth(water) : water,
      hasData: (stats()?.readings.length ?? 0) > 0,
    };
  });

  const totalWater = () => (stats()?.readings ?? []).reduce((sum, reading) => sum + waterValue(reading), 0);
  const avgMoisture = () => average((stats()?.readings ?? []).map((reading) => Number(reading.moisturePercent ?? 0)));
  const avgFlow = () => average((stats()?.readings ?? []).map((reading) => Number(reading.flowLmin ?? 0)));
  const irrigationCount = () => stats()?.events.length ?? 0;
  const autoCount = () => stats()?.events.filter((e) => e.mode === "AUTO").length ?? 0;
  const manualCount = () => stats()?.events.filter((e) => e.mode === "MANUAL").length ?? 0;
  const waterMax = () => Math.max(1, ...chartSeries().water);

  const rangeLabel: Record<Range, string> = { today: "Hari Ini", "7d": "7 Hari Terakhir", "30d": "30 Hari Terakhir" };

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

        <div class="animate-in-soft flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex flex-wrap gap-1">
              {(["today", "7d", "30d"] as Range[]).map((item) => (
                <button
                  type="button"
                  class={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${range() === item ? "text-emerald-700 underline underline-offset-4" : "text-slate-500 hover:text-slate-800"}`}
                  onClick={() => setRange(item)}
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
          <div class="flex gap-1 rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${dataMode() === "raw" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setDataMode("raw")}
            >
              <ChartBar size={16} />
              Data Mentah
            </button>
            <button
              type="button"
              class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${dataMode() === "smooth" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setDataMode("smooth")}
            >
              <Activity size={16} />
              Smoothing
            </button>
          </div>
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
            <StatBadge label="Total Penggunaan Air Keseluruhan" value={totalWater().toFixed(2)} sub="Liter" />
            <StatBadge label="Kelembaban Rata Rata Keseluruhan" value={`${avgMoisture().toFixed(2)}%`} accent />
          </div>

          <div class="animate-in-soft rounded-xl border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 class="font-semibold text-slate-900">Ringkasan Statistik</h2>
            </div>
            <div class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label="Frekuensi Irigasi Aktif"
                value={String(irrigationCount())}
                sub={`${autoCount()}x Otomatis - ${manualCount()}x Manual`}
                labelColor="text-amber-600"
              />
              <MiniStat
                label="Kelembaban Rata Rata"
                value={`${avgMoisture().toFixed(2)}%`}
                sub={avgMoisture() <= 40 ? "Kering" : avgMoisture() >= 80 ? "Basah" : "Lembab"}
              />
              <MiniStat label="Total Air Keluar" value={totalWater().toFixed(2)} sub="Liter" />
              <MiniStat label="Debit Air Rata Rata" value={avgFlow().toFixed(2)} sub="Liter/menit" />
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
                  <h3 class="text-sm font-semibold text-slate-700">Penggunaan Air</h3>
                  <Show when={!chartSeries().hasData}>
                    <span class="text-xs text-slate-400">Belum ada data penggunaan air</span>
                  </Show>
                </div>
                <LineChart
                  labels={chartSeries().labels}
                  data={chartSeries().water}
                  label="Penggunaan Air"
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
