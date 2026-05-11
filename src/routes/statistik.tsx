import { cache, createAsync } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show, Suspense } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { getStatistics } from "~/server/actions";
import { SkCard } from "~/components/Sk";
import type { Chart as ChartType } from "chart.js";

type Range = "today" | "7d" | "30d";
type DataMode = "raw" | "smooth";

const loadStats = cache((range: Range) => getStatistics({ range }), "statistics");
export const route = { preload: () => loadStats("today") };

function StatBadge(props: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div class={`flex-1 rounded-xl p-5 text-white ${props.accent ? "bg-emerald-600" : "bg-emerald-500"}`}>
      <p class="text-sm opacity-90">{props.label}</p>
      <p class="mt-1 text-3xl font-bold">{props.value}</p>
      <Show when={props.sub}><p class="mt-0.5 text-sm opacity-70">{props.sub}</p></Show>
    </div>
  );
}

function MiniStat(props: { label: string; value: string; sub?: string; labelColor?: string }) {
  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <p class={`text-sm font-medium ${props.labelColor ?? "text-slate-500"}`}>{props.label}</p>
      <p class="mt-1 text-2xl font-bold text-slate-900">{props.value}</p>
      <Show when={props.sub}><p class="text-xs text-slate-400">{props.sub}</p></Show>
    </div>
  );
}

function LineChart(props: { labels: string[]; data: number[]; label: string; color: string }) {
  let canvas: HTMLCanvasElement | undefined;
  let chart: ChartType | undefined;

  onMount(async () => {
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    if (!canvas) return;
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: props.labels,
        datasets: [{
          label: props.label,
          data: props.data,
          borderColor: props.color,
          backgroundColor: props.color + "22",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        },
      },
    });
    onCleanup(() => chart?.destroy());
  });

  return (
    <div class="relative h-48">
      <canvas ref={canvas} />
    </div>
  );
}

function buildTimeLabels(range: Range, readings: { recordedAt: Date }[]): string[] {
  if (range === "today") {
    return Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`);
  }
  if (range === "7d") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400_000);
      return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    });
  }
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(Date.now() - (3 - i) * 7 * 86400_000);
    return "W" + (i + 1);
  });
}

export default function Statistik() {
  const [range, setRange] = createSignal<Range>("today");
  const [dataMode, setDataMode] = createSignal<DataMode>("raw");

  const stats = createAsync(() => loadStats(range()));

  const readingsByHour = () => {
    const s = stats();
    if (!s?.readings.length) return { labels: [], moisture: [], flow: [] };
    const labels = buildTimeLabels(range(), s.readings);

    const buckets: { moisture: number[]; flow: number[] }[] = labels.map(() => ({ moisture: [], flow: [] }));

    for (const r of s.readings) {
      const d = new Date(r.recordedAt);
      let idx = 0;
      if (range() === "today") {
        idx = Math.floor(d.getHours() / 2);
      } else if (range() === "7d") {
        const diff = Math.floor((Date.now() - d.getTime()) / 86400_000);
        idx = 6 - diff;
      } else {
        idx = Math.floor((Date.now() - d.getTime()) / (7 * 86400_000));
        idx = Math.max(0, 3 - idx);
      }
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].moisture.push(Number(r.moisturePercent));
        buckets[idx].flow.push(Number(r.flowLmin));
      }
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      labels,
      moisture: buckets.map((b) => avg(b.moisture)),
      flow: buckets.map((b) => avg(b.flow)),
    };
  };

  const totalWater = () => {
    const s = stats();
    if (!s?.readings.length) return 0;
    return s.readings.reduce((sum, r) => sum + Number(r.flowLmin), 0);
  };

  const avgMoisture = () => {
    const s = stats();
    if (!s?.readings.length) return 0;
    return s.readings.reduce((sum, r) => sum + Number(r.moisturePercent), 0) / s.readings.length;
  };

  const irrigationCount = () => stats()?.events.length ?? 0;
  const autoCount = () => stats()?.events.filter((e) => e.mode === "AUTO").length ?? 0;
  const manualCount = () => stats()?.events.filter((e) => e.mode === "MANUAL").length ?? 0;

  const rangeLabel: Record<Range, string> = { today: "Hari Ini", "7d": "7 Hari Terakhir", "30d": "30 Hari Terakhir" };

  return (
    <>
      <Title>Statistik | Adosistering</Title>
      <Meta name="description" content="Statistik penggunaan air, kelembaban tanah, dan aktivitas irigasi." />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Statistik</h1>

        {/* Controls */}
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div class="flex gap-1">
            {(["today", "7d", "30d"] as Range[]).map((r) => (
              <button
                type="button"
                class={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${range() === r ? "text-emerald-700 underline underline-offset-4" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => setRange(r)}
              >
                {rangeLabel[r]}
              </button>
            ))}
          </div>
          <div class="flex gap-1 rounded-lg border border-slate-200 p-0.5">
            <button type="button" class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${dataMode() === "raw" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setDataMode("raw")}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              Data Mentah
            </button>
            <button type="button" class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${dataMode() === "smooth" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setDataMode("smooth")}>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M3 12c2-6 8-6 10 0s8 6 8 0" /></svg>
              Smoothing
            </button>
          </div>
        </div>

        <Suspense fallback={<div class="grid gap-4 sm:grid-cols-2"><SkCard /><SkCard /></div>}>
          {/* Global aggregates */}
          <div class="flex flex-wrap gap-4">
            <StatBadge label="Total Penggunaan Air Keseluruhan" value={`${totalWater().toFixed(2)}`} sub="Liter" />
            <StatBadge label="Kelembaban Rata Rata Keseluruhan" value={`${avgMoisture().toFixed(2)}%`} accent />
          </div>

          {/* Per-group stats */}
          <div class="rounded-xl border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 class="font-semibold text-slate-900">Ringkasan Statistik</h2>
            </div>
            <div class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Frekuensi Irigasi Aktif" value={String(irrigationCount())} sub={`${autoCount()}x Otomatis · ${manualCount()}x Manual`} labelColor="text-amber-600" />
              <MiniStat
                label="Kelembaban Rata Rata"
                value={`${avgMoisture().toFixed(2)}%`}
                sub={
                  avgMoisture() <= 40 ? "Kering" : avgMoisture() >= 80 ? "Basah" : "Lembab"
                }
              />
              <MiniStat label="Total Air Keluar" value={totalWater().toFixed(2)} sub="Liter" />
              <MiniStat label="Debit Air Rata Rata" value="0.00" sub="Liter/menit" />
            </div>

            {/* Charts */}
            <div class="grid gap-5 p-5 lg:grid-cols-2">
              <div class="rounded-xl border border-slate-100 p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-700">Kelembaban Tanah</h3>
                <Show
                  when={readingsByHour().labels.length > 0}
                  fallback={<div class="flex h-48 items-center justify-center text-sm text-slate-400">Belum ada data sensor</div>}
                >
                  <LineChart labels={readingsByHour().labels} data={readingsByHour().moisture} label="Kelembaban Tanah" color="#10b981" />
                </Show>
              </div>
              <div class="rounded-xl border border-slate-100 p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-700">Penggunaan Air</h3>
                <Show
                  when={readingsByHour().labels.length > 0}
                  fallback={<div class="flex h-48 items-center justify-center text-sm text-slate-400">Belum ada data penggunaan air</div>}
                >
                  <LineChart labels={readingsByHour().labels} data={readingsByHour().flow} label="Penggunaan Air" color="#3b82f6" />
                </Show>
              </div>
            </div>
          </div>
        </Suspense>
      </div>
    </>
  );
}
