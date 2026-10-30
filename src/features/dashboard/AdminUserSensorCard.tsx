import { EllipsisVertical } from "lucide-solid";
import { A } from "@solidjs/router";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card } from "~/components/ui/Card";
import { InlineError } from "~/components/shared/AppErrorBoundary";
import type { LiveSprayerData, Threshold } from "~/lib/shared/irrigation";
import { isFirebaseConfigured, subscribeToBlock } from "~/lib/client/firebaseClient";
import { useNow } from "~/lib/client/liveDate";
import type { AdminUserCard } from "./DashboardTypes";
import { createVolumeTotals } from "./useVolumeTotals";
import { deriveLiveStatus, formatLastUpdated } from "./helpers";
import { ROUTES } from "~/constants/routes";

export function AdminUserSensorCard(props: { user: AdminUserCard }) {
  const [allLive, setAllLive] = createSignal<Map<string, LiveSprayerData[]>>(new Map());
  const [loading, setLoading] = createSignal<boolean>(props.user.sprayersByBlock.length > 0);
  const [error, setError] = createSignal<string>("");
  const [menuOpen, setMenuOpen] = createSignal<boolean>(false);
  const nowMs = useNow(30_000);
  const volumes = createVolumeTotals(() => props.user.sprayersByBlock.map((sprayer) => sprayer.sprayerId));
  // Firebase node key (hardware id) -> database sprayer id, per region/block.
  const sprayerDbId = (blockKey: string, hardwareId: string) =>
    props.user.sprayersByBlock.find(
      (s) => `${s.regionName}::${s.blockName}` === blockKey && s.hardwareId === hardwareId,
    )?.sprayerId;

  onMount(() => {
    if (props.user.sprayersByBlock.length === 0) {
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setError("Konfigurasi Firebase belum lengkap.");
      return;
    }

    const blockMap = new Map<
      string,
      { regionName: string; blockName: string; sprayerIds: string[]; threshold: Threshold }
    >();
    for (const s of props.user.sprayersByBlock) {
      const key = `${s.regionName}::${s.blockName}`;
      if (!blockMap.has(key)) {
        blockMap.set(key, {
          regionName: s.regionName,
          blockName: s.blockName,
          sprayerIds: [],
          threshold: s.threshold
            ? {
                dryMaxPercent: s.threshold.dryMaxPercent,
                wetMinPercent: s.threshold.wetMinPercent,
                displayDryMaxPercent: s.threshold.displayDryMaxPercent,
                displayMoistMaxPercent: s.threshold.displayMoistMaxPercent,
                displayWetMinPercent: s.threshold.displayWetMinPercent,
                volumeDivider: s.volumeDivider,
              }
            : { dryMaxPercent: 40, wetMinPercent: 80, volumeDivider: s.volumeDivider },
        });
      }
      blockMap.get(key)!.sprayerIds.push(s.hardwareId);
    }

    let loaded = 0;
    const total = blockMap.size;
    const unsubscribers: (() => void)[] = [];

    for (const [key, block] of blockMap) {
      const unsub = subscribeToBlock(
        {
          regionName: block.regionName,
          blockName: block.blockName,
          sprayerIds: block.sprayerIds,
          threshold: block.threshold,
        },
        (sprayers) => {
          setAllLive((prev) => {
            const next = new Map(prev);
            next.set(key, sprayers);
            return next;
          });
          if (loaded < total) {
            loaded++;
            if (loaded === total) setLoading(false);
          }
          setError("");
        },
        (err) => {
          if (loaded < total) {
            loaded++;
            if (loaded === total) setLoading(false);
          }
          setError(err.message);
        },
      );
      unsubscribers.push(unsub);
    }

    onCleanup(() => unsubscribers.forEach((u) => u()));
  });

  const allEntries = createMemo(() =>
    [...allLive().entries()].flatMap(([blockKey, rows]) =>
      rows.map((row) => ({ row, id: sprayerDbId(blockKey, row.sprayerId) })),
    ),
  );
  const allSprayers = createMemo(() => allEntries().map((entry) => entry.row));
  const monitorError = () => error().length > 0;
  // Only fresh rows may feed the aggregate. Stale snapshots stay visible as a
  // "last seen" timestamp, never as current moisture, volume, or pump state.
  const freshSprayers = createMemo(() => {
    const tick = nowMs();
    const failed = monitorError();
    return allSprayers().filter((sprayer) => {
      const status = deriveLiveStatus(sprayer, tick, failed);
      return status === "watering" || status === "no-flow" || status === "idle";
    });
  });
  const freshEntries = createMemo(() => {
    const tick = nowMs();
    const failed = monitorError();
    return allEntries().filter((entry) => {
      const status = deriveLiveStatus(entry.row, tick, failed);
      return status === "watering" || status === "no-flow" || status === "idle";
    });
  });
  const avgMoisture = () => {
    const items = freshSprayers();
    if (!items.length) return null;
    return items.reduce((sum, s) => sum + s.moisturePercent, 0) / items.length;
  };
  const totalVolume = () => {
    const entries = freshEntries();
    if (!entries.length) return null;
    return entries.reduce((sum, entry) => sum + volumes.volumeFor(entry.id ?? "", entry.row), 0);
  };
  const activePumps = () => {
    const items = freshSprayers();
    if (!items.length) return null;
    return items.filter((s) => s.pumpOn).length;
  };
  const moistureText = () => {
    const value = avgMoisture();
    return value === null ? "-" : `${value.toFixed(2)}%`;
  };
  const volumeText = () => {
    const value = totalVolume();
    return value === null ? "-" : `${value.toFixed(2)} L`;
  };
  const pumpText = () => {
    const value = activePumps();
    return value === null ? "-" : `${value} / ${freshSprayers().length}`;
  };

  // "Terakhir update": the newest device heartbeat (`last_updated`) across this
  // user's sprayers, falling back to the stored data stamps before any report.
  const latestDataAt = () => {
    let latest: number | null = null;
    for (const { row } of allEntries()) {
      if (row.lastUpdated) latest = Math.max(latest ?? 0, row.lastUpdated * 1000);
    }
    if (latest !== null) return latest;
    for (const sprayer of props.user.sprayersByBlock) {
      const stored = sprayer.lastDataAt ? Date.parse(sprayer.lastDataAt) : Number.NaN;
      if (Number.isFinite(stored)) latest = Math.max(latest ?? 0, stored);
    }
    return latest;
  };

  const hasFreshData = () => freshSprayers().length > 0;

  const liveSummary = () => {
    if (loading()) return { label: "Memuat", tone: "muted" as const };
    if (monitorError()) return { label: "Data Tidak Tersedia", tone: "warning" as const };
    return hasFreshData()
      ? { label: "Realtime", tone: "success" as const }
      : { label: "Menunggu Data", tone: "warning" as const };
  };

  return (
    <Card class="p-5">
      <div class="mb-4 flex items-start gap-3">
        <div class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gray-200 text-sm font-bold text-[#4F4F4F]">
          {props.user.name.slice(0, 2).toUpperCase()}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="min-w-0 truncate text-lg font-bold text-[#467A30]">{props.user.name}</p>
            <Badge tone={props.user.isActive ? "success" : "danger"} class="shrink-0">
              {props.user.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </div>
          <p class="truncate text-sm text-[#808080]">
            {[props.user.domicile, props.user.city].filter(Boolean).join(", ") || "-"}
          </p>
          <p class="mt-0.5 line-clamp-2 break-anywhere text-xs text-slate-400">
            {props.user.regions.map((r) => r.name).join(", ")}
          </p>
        </div>
        <div class="relative shrink-0">
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#467A30] hover:bg-gray-100"
            aria-label={`Menu pengguna ${props.user.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen()}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <EllipsisVertical size={20} />
          </button>
          <Show when={menuOpen()}>
            <div
              role="menu"
              aria-label={`Menu pengguna ${props.user.name}`}
              class="absolute right-0 top-10 z-20 w-44 rounded-xl border border-gray-200 bg-white py-2 text-sm shadow-lg"
            >
              <A
                href={`${ROUTES.adminView}/${props.user.id}`}
                role="menuitem"
                aria-label={`Lihat detail ${props.user.name}`}
                class="block px-4 py-2 text-[#4F4F4F] hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Lihat Detail
              </A>
              <A
                href={`/user-management?search=${encodeURIComponent(props.user.email)}`}
                role="menuitem"
                aria-label={`Kelola pengguna ${props.user.name}`}
                class="block px-4 py-2 text-[#4F4F4F] hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Kelola Pengguna
              </A>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-4 py-2 text-left text-[#4F4F4F] hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Tutup
              </button>
            </div>
          </Show>
        </div>
      </div>

      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p class="font-semibold text-[#4F4F4F]">Sensor Data (Agregat)</p>
        <Badge tone={liveSummary().tone}>{liveSummary().label}</Badge>
      </div>

      <div class="space-y-2 border-t border-[#C2C2C2] pt-3 text-sm">
        <Show when={error()}>{(message) => <InlineError message={message()} />}</Show>
        <Show
          when={!loading()}
          fallback={
            <div class="space-y-2">
              <div class="skeleton h-4 w-full" />
              <div class="skeleton h-4 w-4/5" />
              <div class="skeleton h-4 w-3/5" />
            </div>
          }
        >
          <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <span class="min-w-0 text-[#4F4F4F]">Kelembaban Rata-Rata</span>
            <span class="min-w-0 break-words text-right font-semibold text-[#4F8936]">{moistureText()}</span>
          </div>
          <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <span class="min-w-0 text-[#4F4F4F]">Total Volume Air</span>
            <span class="min-w-0 break-words text-right font-semibold text-[#4F8936]">{volumeText()}</span>
          </div>
          <div class="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <span class="min-w-0 text-[#4F4F4F]">Pompa Aktif</span>
            <span class="min-w-0 break-words text-right font-semibold text-[#4F8936]">{pumpText()}</span>
          </div>
        </Show>
      </div>

      <p class="mt-4 text-right text-xs italic text-[#808080]">
        {latestDataAt() === null ? "Belum ada data" : `Terakhir update ${formatLastUpdated(new Date(latestDataAt()!))}`}
      </p>
    </Card>
  );
}
