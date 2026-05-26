import { EllipsisVertical } from "lucide-solid";
import { A } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card } from "~/components/ui/Card";
import { InlineError } from "~/components/shared/AppErrorBoundary";
import type { LiveSprayerData, Threshold } from "~/lib/shared/irrigation";
import { isFirebaseConfigured, subscribeToBlock } from "~/lib/client/firebaseClient";
import type { AdminUserCard } from "./DashboardTypes";
import { formatLastUpdated } from "./helpers";
import { ROUTES } from "~/constants/routes";

export function AdminUserSensorCard(props: { user: AdminUserCard }) {
  const [allLive, setAllLive] = createSignal<Map<string, LiveSprayerData[]>>(new Map());
  const [loading, setLoading] = createSignal(props.user.sprayersByBlock.length > 0);
  const [error, setError] = createSignal("");
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [lastSeen, setLastSeen] = createSignal<Date | null>(null);

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

    const blockMap = new Map<string, { regionName: string; blockName: string; threshold: Threshold }>();
    for (const s of props.user.sprayersByBlock) {
      const key = `${s.regionName}::${s.blockName}`;
      if (!blockMap.has(key)) {
        blockMap.set(key, {
          regionName: s.regionName,
          blockName: s.blockName,
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
    }

    let loaded = 0;
    const total = blockMap.size;
    const unsubscribers: (() => void)[] = [];

    for (const [key, block] of blockMap) {
      const unsub = subscribeToBlock(
        { regionName: block.regionName, blockName: block.blockName, threshold: block.threshold },
        (sprayers) => {
          setAllLive((prev) => {
            const next = new Map(prev);
            next.set(key, sprayers);
            return next;
          });
          setLastSeen(new Date());
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

  const allSprayers = () => [...allLive().values()].flat();
  const avgMoisture = () => {
    const items = allSprayers();
    if (!items.length) return 0;
    return items.reduce((sum, s) => sum + s.moisturePercent, 0) / items.length;
  };
  const totalVolume = () => allSprayers().reduce((sum, s) => sum + s.totalVolumeLiter, 0);
  const activePumps = () => allSprayers().filter((s) => s.pumpOn).length;
  const connected = () => allSprayers().length > 0;

  return (
    <Card class="p-5">
      <div class="mb-4 flex items-start gap-3">
        <div class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gray-200 text-sm font-bold text-[#4F4F4F]">
          {props.user.name.slice(0, 2).toUpperCase()}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-lg font-bold text-[#467A30]">{props.user.name}</p>
          <p class="truncate text-sm text-[#808080]">
            {[props.user.domicile, props.user.city].filter(Boolean).join(", ") || "-"}
          </p>
          <p class="mt-0.5 text-xs text-slate-400">{props.user.regions.map((r) => r.name).join(", ")}</p>
        </div>
        <div class="relative">
          <button
            type="button"
            class="rounded-lg p-1 text-[#467A30] hover:bg-gray-100"
            aria-label="Menu pengguna"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <EllipsisVertical size={20} />
          </button>
          <Show when={menuOpen()}>
            <div class="absolute right-0 top-8 z-20 w-44 rounded-xl border border-gray-200 bg-white py-2 text-sm shadow-lg">
              <A
                href={`${ROUTES.adminView}/${props.user.id}`}
                class="block px-4 py-2 text-[#4F4F4F] hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Lihat Detail
              </A>
              <A
                href={`/user-management?search=${encodeURIComponent(props.user.email)}`}
                class="block px-4 py-2 text-[#4F4F4F] hover:bg-gray-50"
              >
                Kelola Pengguna
              </A>
              <button
                type="button"
                class="block w-full px-4 py-2 text-left text-[#4F4F4F] hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                Tutup
              </button>
            </div>
          </Show>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between">
        <p class="font-semibold text-[#4F4F4F]">Sensor Data (Agregat)</p>
        <Badge tone={connected() ? "success" : "danger"}>{connected() ? "Terhubung" : "Terputus"}</Badge>
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
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Kelembaban Rata-Rata</span>
            <span class="font-semibold text-[#4F8936]">{avgMoisture().toFixed(2)}%</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Total Volume Air</span>
            <span class="font-semibold text-[#4F8936]">{totalVolume().toFixed(2)} L</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Pompa Aktif</span>
            <span class="font-semibold text-[#4F8936]">
              {activePumps()} / {allSprayers().length}
            </span>
          </div>
        </Show>
      </div>

      <p class="mt-4 text-right text-xs italic text-[#808080]">Terakhir update {formatLastUpdated(lastSeen())}</p>
    </Card>
  );
}
