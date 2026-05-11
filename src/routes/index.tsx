import { cache, createAsync, A } from "@solidjs/router";
import {
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type JSX,
} from "solid-js";
import { Meta, Title } from "@solidjs/meta";
import { getMyDashboard, overridePump, type AdminUserCard, type DashboardRegion, type SuperadminSummary } from "~/server/actions";
import { getUser } from "~/server/auth";
import { subscribeToBlock, subscribeToRegion, subscribeToSprayer, isFirebaseConfigured } from "~/lib/firebaseClient";
import type { LiveSprayerData } from "~/domain/irrigation";
import { SkCard } from "~/components/Sk";
import { useConfirm } from "~/components/ConfirmProvider";
import { useToast } from "~/components/ToastProvider";

const loadDashboard = cache(() => getMyDashboard(), "dashboard");
const loadUser = cache(() => getUser(), "current-user");

export const route = { preload: () => loadDashboard() };

// ── helpers ────────────────────────────────────────────────────────────────────

function moistureBadgeClass(status: string) {
  if (status === "Kering") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "Basah") return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function pumpBadge(status: string) {
  const on = status === "ON" || status === "AKTIF" || status === "Aktif";
  return (
    <span class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
      {on ? "Aktif" : "Mati"}
    </span>
  );
}

function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const size = props.size ?? "md";
  const trackSize = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const thumbSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const translateX = size === "sm" ? "translate-x-4" : "translate-x-5";
  return (
    <label class="flex cursor-pointer items-center gap-2">
      <Show when={props.label}>
        <span class="text-xs text-slate-600">{props.label}</span>
      </Show>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        class={`relative inline-flex ${trackSize} shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 ${
          props.checked ? "bg-emerald-500" : "bg-slate-200"
        }`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span
          class={`pointer-events-none inline-block ${thumbSize} rounded-full bg-white shadow-md transition-transform ${
            props.checked ? translateX : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

// ── Block card (real-time) ────────────────────────────────────────────────────

function BlockCard(props: {
  blockId: string;
  blockName: string;
  location: string | null;
  regionName: string;
  sprayers: { id: string; hardwareId: string; displayName: string }[];
}) {
  const [liveData, setLiveData] = createSignal<LiveSprayerData[]>([]);
  const [lastSeen, setLastSeen] = createSignal<Date | null>(null);
  const [connected, setConnected] = createSignal(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  // aggregate
  const avgMoisture = () => {
    const d = liveData();
    if (!d.length) return 0;
    return d.reduce((s, x) => s + x.moisturePercent, 0) / d.length;
  };
  const avgFlow = () => {
    const d = liveData();
    if (!d.length) return 0;
    return d.reduce((s, x) => s + x.flowLmin, 0) / d.length;
  };
  const primaryData = () => liveData()[0];
  const moistureStatus = () => primaryData()?.moistureStatus ?? "Kering";

  onMount(() => {
    if (!isFirebaseConfigured()) return;
    const unsub = subscribeToBlock(
      { regionName: props.regionName, blockName: props.blockName, threshold: { dryMaxPercent: 40, wetMinPercent: 80 } },
      (sprayers) => {
        setLiveData(sprayers);
        if (sprayers.length > 0) {
          setLastSeen(new Date());
          setConnected(true);
        }
      },
    );
    // Safety timeout: 5 minutes
    const interval = setInterval(() => {
      const ls = lastSeen();
      if (ls && Date.now() - ls.getTime() > 5 * 60 * 1000) setConnected(false);
    }, 30_000);
    onCleanup(() => { unsub(); clearInterval(interval); });
  });

  const formatLastSeen = () => {
    const ls = lastSeen();
    if (!ls) return "Belum ada data";
    const diff = Math.floor((Date.now() - ls.getTime()) / 1000);
    if (diff < 60) return `${diff} detik yang lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
    return `${Math.floor(diff / 3600)} jam yang lalu`;
  };

  const toggleRelay = async (sprayerId: string, current: LiveSprayerData) => {
    const newRelay = current.relay === 0 ? "ON" : "OFF";
    const ok = await confirm({
      title: `${newRelay === "ON" ? "Nyalakan" : "Matikan"} pompa?`,
      message: `Pompa ${current.sprayerId} akan diubah ke mode manual ${newRelay}.`,
      confirmLabel: newRelay === "ON" ? "Nyalakan" : "Matikan",
      tone: newRelay === "OFF" ? "danger" : "primary",
    });
    if (!ok) return;
    try {
      await overridePump({ sprayerId, mode: "MANUAL", relay: newRelay });
      notify({ kind: "success", title: `Pompa ${newRelay === "ON" ? "dinyalakan" : "dimatikan"}` });
    } catch {
      notify({ kind: "error", title: "Gagal mengubah status pompa" });
    }
  };

  const toggleAuto = async (sprayerId: string, current: LiveSprayerData) => {
    const newMode = current.mode === 0 ? "MANUAL" : "AUTO";
    const ok = await confirm({
      title: `${newMode === "AUTO" ? "Aktifkan" : "Nonaktifkan"} irigasi otomatis?`,
      message: `Mode irigasi ${current.sprayerId} akan diubah ke ${newMode}.`,
      confirmLabel: "Ubah",
    });
    if (!ok) return;
    try {
      await overridePump({ sprayerId, mode: newMode, relay: newMode === "AUTO" ? "OFF" : (current.relay === 1 ? "ON" : "OFF") });
      notify({ kind: "success", title: `Irigasi otomatis ${newMode === "AUTO" ? "aktif" : "nonaktif"}` });
    } catch {
      notify({ kind: "error", title: "Gagal mengubah mode irigasi" });
    }
  };

  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <p class="font-bold text-emerald-700">{props.blockName}</p>
          <Show when={props.location}>
            <p class="mt-0.5 text-xs text-slate-500">{props.location}</p>
          </Show>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-slate-600">Sensor Data</span>
        <span
          class={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            connected() ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {connected() ? "Terhubung" : "Terputus"}
        </span>
      </div>

      <div class="space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Kelembaban Tanah</span>
          <span class="font-semibold text-slate-900">{avgMoisture().toFixed(2)}%</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Debit Air Rata-Rata</span>
          <span class={`font-semibold ${avgFlow() > 0 ? "text-emerald-600" : "text-slate-900"}`}>
            {avgFlow().toFixed(2)} L / Menit
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Total Volume Air</span>
          <span class="font-semibold text-slate-900">0 Liter</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Pompa</span>
          {pumpBadge(primaryData()?.pumpStatus ?? "STANDBY")}
        </div>
      </div>

      <p class="mt-3 text-[11px] italic text-slate-400">Terakhir update {formatLastSeen()}</p>

      <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <Show when={primaryData()} fallback={<Toggle checked={false} onChange={() => {}} label="OFF" disabled />}>
          {(d) => (
            <Toggle
              checked={d().relay === 1}
              label={d().relay === 1 ? "ON" : "OFF"}
              onChange={() => {
                const s = props.sprayers[0];
                if (s) toggleRelay(s.id, d());
              }}
              disabled={d().mode === 0}
            />
          )}
        </Show>
        <Show when={primaryData()} fallback={<Toggle checked={false} onChange={() => {}} label="Irigasi Otomatis" size="sm" disabled />}>
          {(d) => (
            <Toggle
              checked={d().mode === 0}
              label="Irigasi Otomatis"
              size="sm"
              onChange={() => {
                const s = props.sprayers[0];
                if (s) toggleAuto(s.id, d());
              }}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

// ── Region section ────────────────────────────────────────────────────────────

function RegionSection(props: { region: DashboardRegion }) {
  const [expanded, setExpanded] = createSignal(true);
  const [liveAll, setLiveAll] = createSignal<Record<string, LiveSprayerData[]>>({});
  const confirm = useConfirm();
  const { notify } = useToast();

  onMount(() => {
    if (!isFirebaseConfigured()) return;
    const unsub = subscribeToRegion(
      { regionName: props.region.name, threshold: { dryMaxPercent: 40, wetMinPercent: 80 } },
      (data) => setLiveAll(data),
    );
    onCleanup(unsub);
  });

  const allSprayers = () => props.region.blocks.flatMap((b) => b.sprayers);

  const bulkControl = async (relay: "ON" | "OFF") => {
    const label = relay === "ON" ? "Nyalakan Semua" : "Matikan Semua";
    const ok = await confirm({
      title: `${label}?`,
      message: `Semua pompa di region ${props.region.name} akan ${relay === "ON" ? "dinyalakan" : "dimatikan"} secara manual.`,
      confirmLabel: label,
      tone: relay === "OFF" ? "danger" : "primary",
    });
    if (!ok) return;
    try {
      await Promise.all(allSprayers().map((s) => overridePump({ sprayerId: s.id, mode: "MANUAL", relay })));
      notify({ kind: "success", title: `${label} berhasil` });
    } catch {
      notify({ kind: "error", title: "Gagal mengubah semua pompa" });
    }
  };

  // compute aggregates
  const allLive = () => Object.values(liveAll()).flat();
  const avgMoisture = () => {
    const d = allLive();
    return d.length ? d.reduce((s, x) => s + x.moisturePercent, 0) / d.length : 0;
  };
  const avgFlow = () => {
    const d = allLive();
    return d.length ? d.reduce((s, x) => s + x.flowLmin, 0) / d.length : 0;
  };

  const mStatus = () => {
    const m = avgMoisture();
    if (m <= 40) return { label: "Kering", cls: "bg-amber-100 text-amber-700" };
    if (m >= 80) return { label: "Basah", cls: "bg-sky-100 text-sky-700" };
    return { label: "Lembab", cls: "bg-emerald-100 text-emerald-700" };
  };

  return (
    <section class="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span class="flex-1 font-semibold text-slate-900">{props.region.name}</span>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            onClick={() => bulkControl("ON")}
          >
            Nyalakan Semua
          </button>
          <button
            type="button"
            class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            onClick={() => bulkControl("OFF")}
          >
            Matikan Semua
          </button>
        </div>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded() ? "Ciutkan" : "Perluas"}
        >
          <svg class={`h-4 w-4 transition-transform ${expanded() ? "rotate-180" : ""}`} fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Aggregate stats */}
      <Show when={expanded()}>
        <div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 px-5 py-3">
          <div class="pr-4">
            <p class="text-[11px] text-slate-500">Kelembaban Tanah Rata-Rata</p>
            <div class="flex items-center gap-2">
              <span class="text-xl font-bold text-slate-900">{avgMoisture().toFixed(2)}%</span>
              <span class={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mStatus().cls}`}>{mStatus().label}</span>
            </div>
          </div>
          <div class="px-4">
            <p class="text-[11px] text-slate-500">Debit Air Rata-Rata</p>
            <p class="text-xl font-bold text-slate-900">{avgFlow().toFixed(2)} <span class="text-sm font-normal text-slate-500">L/min</span></p>
          </div>
          <div class="pl-4">
            <p class="text-[11px] text-slate-500">Total Volume Air</p>
            <p class="text-xl font-bold text-slate-900">0.00 <span class="text-sm font-normal text-slate-500">L</span></p>
          </div>
        </div>

        {/* Block cards */}
        <div class="grid gap-4 p-5 sm:grid-cols-2">
          <For each={props.region.blocks}>
            {(block) => (
              <BlockCard
                blockId={block.id}
                blockName={block.name}
                location={null}
                regionName={props.region.name}
                sprayers={block.sprayers}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

// ── Admin user card ───────────────────────────────────────────────────────────

function AdminUserCard(props: { user: AdminUserCard }) {
  const [live, setLive] = createSignal<LiveSprayerData | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [lastSeen, setLastSeen] = createSignal<Date | null>(null);

  onMount(() => {
    if (!props.user.primarySprayer || !isFirebaseConfigured()) return;
    const s = props.user.primarySprayer!;
    const unsub = subscribeToSprayer(
      { regionName: s.regionName, blockName: s.blockName, sprayerId: s.hardwareId, threshold: { dryMaxPercent: 40, wetMinPercent: 80 } },
      (data) => {
        setLive(data);
        setLastSeen(new Date());
        setConnected(true);
      },
    );
    const interval = setInterval(() => {
      const ls = lastSeen();
      if (ls && Date.now() - ls.getTime() > 5 * 60 * 1000) setConnected(false);
    }, 30_000);
    onCleanup(() => { unsub(); clearInterval(interval); });
  });

  const formatLastSeen = () => {
    const ls = lastSeen();
    if (!ls) return "Belum ada data";
    const diff = Math.floor((Date.now() - ls.getTime()) / 1000);
    if (diff < 60) return `${diff} detik yang lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
    return `${Math.floor(diff / 3600)} jam yang lalu`;
  };

  const d = () => live();

  return (
    <div class="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div class="mb-3 flex items-start justify-between gap-2">
        <div>
          <p class="font-bold text-emerald-700">{props.user.name}</p>
          <p class="text-xs text-slate-500">{[props.user.domicile, props.user.city].filter(Boolean).join(", ") || "—"}</p>
        </div>
        <button type="button" class="text-slate-400 hover:text-slate-600">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="19" r="1" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div class="mb-3 flex items-center justify-between">
        <span class="text-xs font-medium text-slate-600">Sensor Data</span>
        <span class={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${connected() ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {connected() ? "Terhubung" : "Terputus"}
        </span>
      </div>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-500">Kelembaban Tanah</span>
          <span class={`font-semibold ${(d()?.moisturePercent ?? 0) > 0 ? "text-emerald-600" : "text-slate-900"}`}>
            {(d()?.moisturePercent ?? 0).toFixed(2)}%
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Debit Air Rata-Rata</span>
          <span class={`font-semibold ${(d()?.flowLmin ?? 0) > 0 ? "text-emerald-600" : "text-slate-900"}`}>
            {(d()?.flowLmin ?? 0).toFixed(0)} L / Menit
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Total Volume Air</span>
          <span class="font-semibold text-slate-900">0 Liter</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Pompa</span>
          {pumpBadge(d()?.pumpStatus ?? "STANDBY")}
        </div>
      </div>
      <p class="mt-3 text-[11px] italic text-slate-400">Terakhir update {formatLastSeen()}</p>
    </div>
  );
}

// ── Map placeholder ───────────────────────────────────────────────────────────

function MapCard() {
  return (
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 class="font-semibold text-slate-900">Peta Area Irigasi IoT</h2>
        <div class="flex gap-2">
          <button type="button" class="rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">Satelit</button>
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Standar</button>
        </div>
      </div>
      <div class="relative flex h-64 items-center justify-center bg-slate-100">
        <p class="text-sm text-slate-400">
          Konfigurasikan <code class="rounded bg-slate-200 px-1 text-xs">VITE_FIREBASE_*</code> dan polygon GeoJSON untuk menampilkan peta interaktif.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Superadmin dashboard ──────────────────────────────────────────────────────

function StatTile(props: { label: string; value: number; color: string }) {
  return (
    <div class={`flex-1 rounded-xl p-5 text-white ${props.color}`}>
      <p class="text-sm opacity-90">{props.label}</p>
      <p class="mt-1 text-4xl font-bold">{props.value}</p>
    </div>
  );
}

function SuperadminDashboard(props: { summary: SuperadminSummary }) {
  const s = props.summary;
  return (
    <div class="flex flex-col gap-5">
      {/* KPI tiles */}
      <div class="flex flex-wrap gap-4">
        <StatTile label="Total Wilayah" value={s.totalRegions} color="bg-emerald-600" />
        <StatTile label="Total Blok" value={s.totalBlocks} color="bg-sky-600" />
        <StatTile label="Admin Aktif" value={s.totalAdmins} color="bg-violet-600" />
        <StatTile label="Petani Aktif" value={s.totalUsers} color="bg-amber-500" />
      </div>

      {/* Region overview table */}
      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 class="font-semibold text-slate-900">Ringkasan Wilayah</h2>
          <A href="/region" class="text-sm font-medium text-emerald-600 hover:underline">Kelola Region →</A>
        </div>
        <Show
          when={s.regions.length > 0}
          fallback={
            <div class="p-8 text-center text-sm text-slate-500">
              Belum ada region. <A href="/region" class="font-semibold text-emerald-600 underline">Buat region pertama</A>
            </div>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th class="px-5 py-3 text-left">Nama Wilayah</th>
                  <th class="px-5 py-3 text-left">Blok</th>
                  <th class="px-5 py-3 text-left">Admin</th>
                  <th class="px-5 py-3 text-left">Sinkronisasi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <For each={s.regions}>
                  {(r) => {
                    const syncColor = r.syncStatus === "SYNCED" ? "bg-emerald-100 text-emerald-700"
                      : r.syncStatus === "FAILED" ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700";
                    const syncLabel = r.syncStatus === "SYNCED" ? "Tersinkron"
                      : r.syncStatus === "FAILED" ? "Gagal" : "Menunggu";
                    return (
                      <tr class="hover:bg-slate-50">
                        <td class="px-5 py-3">
                          <p class="font-medium text-slate-900">{r.name}</p>
                          <p class="text-xs text-slate-400">{r.description ?? "—"}</p>
                        </td>
                        <td class="px-5 py-3 text-slate-600">{r.blockCount}</td>
                        <td class="px-5 py-3 text-slate-600">{r.adminCount}</td>
                        <td class="px-5 py-3">
                          <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${syncColor}`}>{syncLabel}</span>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      {/* Quick links */}
      <div class="grid gap-4 sm:grid-cols-3">
        {([
          { href: "/manajemen-user", label: "Manajemen User", desc: "Kelola akun pengguna dan peran" },
          { href: "/log-sistem", label: "Log Sistem", desc: "Riwayat aktivitas dan audit trail" },
          { href: "/peta-konfigurasi", label: "Konfigurasi Peta", desc: "Atur koordinat default peta" },
        ] as const).map((item) => (
          <A
            href={item.href}
            class="rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
          >
            <p class="font-semibold text-slate-900">{item.label}</p>
            <p class="mt-1 text-sm text-slate-500">{item.desc}</p>
          </A>
        ))}
      </div>
    </div>
  );
}

export default function Beranda() {
  const dashboard = createAsync(() => loadDashboard());

  return (
    <>
      <Title>Beranda | Adosistering</Title>
      <Meta name="description" content="Dashboard monitoring IoT irigasi sawah secara realtime." />

      <div class="flex flex-col gap-5">
        {/* Title */}
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Beranda</h1>
        </div>

        <Suspense fallback={<div class="grid gap-4"><SkCard /><SkCard /><SkCard /></div>}>
          <Show when={dashboard()}>
            {(data) => (
              <>
                {/* Superadmin view */}
                <Show when={data().type === "superadmin"}>
                  <SuperadminDashboard summary={(data() as { type: "superadmin"; summary: SuperadminSummary }).summary} />
                </Show>

                {/* User view */}
                <Show when={data().type === "user"}>
                  {/* Info banner */}
                  <div class="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-800">
                    Irigasi Otomatis berarti menyalakan pompa berdasarkan kelembaban tanah secara otomatis. Batas kelembaban tanah dapat diatur pada menu{" "}
                    <A href="/pengaturan" class="font-semibold underline">pengaturan</A>. Ketika irigasi otomatis diaktifkan, maka irigasi manual akan dinonaktifkan.
                  </div>

                  <MapCard />

                  <For each={(data() as { type: "user"; regions: DashboardRegion[] }).regions}>
                    {(region) => <RegionSection region={region} />}
                  </For>

                  <Show when={(data() as { type: "user"; regions: DashboardRegion[] }).regions.length === 0}>
                    <div class="rounded-xl border border-slate-200 bg-white p-10 text-center">
                      <p class="text-sm text-slate-500">Belum ada blok yang ditetapkan untuk akun ini.</p>
                      <p class="mt-1 text-xs text-slate-400">Hubungi admin untuk mendapatkan akses ke blok irigasi.</p>
                    </div>
                  </Show>
                </Show>

                {/* Admin view */}
                <Show when={data().type === "admin"}>
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 text-sm text-slate-500">
                      <span>Beranda</span>
                      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" d="M9 18l6-6-6-6" />
                      </svg>
                      <span class="font-medium text-slate-900">List</span>
                    </div>

                    <div class="flex flex-wrap items-center gap-3">
                      <select class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                        <option value="">Semua Status Sensor</option>
                        <option value="connected">Terhubung</option>
                        <option value="disconnected">Terputus</option>
                      </select>
                      <select class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                        <option value="">Semua Status Pompa</option>
                        <option value="on">Aktif</option>
                        <option value="off">Mati</option>
                      </select>
                      <div class="relative">
                        <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Cari nama pengguna atau nama IoT..."
                          class="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <A
                        href="/manajemen-user/tambah"
                        class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Tambah Pengguna
                      </A>
                    </div>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <For each={(data() as { type: "admin"; users: AdminUserCard[] }).users}>
                      {(user) => <AdminUserCard user={user} />}
                    </For>
                  </div>

                  <Show when={(data() as { type: "admin"; users: AdminUserCard[] }).users.length === 0}>
                    <div class="rounded-xl border border-slate-200 bg-white p-10 text-center">
                      <p class="text-sm text-slate-500">Belum ada pengguna yang terdaftar.</p>
                    </div>
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
