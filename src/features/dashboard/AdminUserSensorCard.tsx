import { MoreVertical } from "lucide-solid";
import { A } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card } from "~/components/ui/Card";
import { InlineError } from "~/components/shared/AppErrorBoundary";
import type { LiveSprayerData } from "~/lib/shared/irrigation";
import { isFirebaseConfigured, subscribeToSprayer } from "~/lib/client/firebaseClient";
import type { AdminUserCard } from "./DashboardTypes";
import { formatLastUpdated, pumpBadgeTone } from "./helpers";

export function AdminUserSensorCard(props: { user: AdminUserCard }) {
  const [live, setLive] = createSignal<LiveSprayerData | null>(null);
  const [lastSeen, setLastSeen] = createSignal<Date | null>(null);
  const [loading, setLoading] = createSignal(Boolean(props.user.primarySprayer));
  const [error, setError] = createSignal("");
  const [menuOpen, setMenuOpen] = createSignal(false);

  onMount(() => {
    if (!props.user.primarySprayer) {
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setError("Konfigurasi Firebase belum lengkap.");
      return;
    }
    const sprayer = props.user.primarySprayer;
    const unsubscribe = subscribeToSprayer(
      {
        regionName: sprayer.regionName,
        blockName: sprayer.blockName,
        sprayerId: sprayer.hardwareId,
        threshold: { dryMaxPercent: 40, wetMinPercent: 80 },
      },
      (data) => {
        setLive(data);
        setLastSeen(new Date());
        setLoading(false);
        setError("");
      },
      (err) => {
        setLoading(false);
        setError(err.message);
      },
    );
    onCleanup(unsubscribe);
  });

  const data = () => live();
  const connected = () => Boolean(data());

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
        </div>
        <div class="relative">
          <button
            type="button"
            class="rounded-lg p-1 text-[#467A30] hover:bg-gray-100"
            aria-label="Menu pengguna"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreVertical size={20} />
          </button>
          <Show when={menuOpen()}>
            <div class="absolute right-0 top-8 z-20 w-44 rounded-xl border border-gray-200 bg-white py-2 text-sm shadow-lg">
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
        <p class="font-semibold text-[#4F4F4F]">Sensor Data</p>
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
            <span class="text-[#4F4F4F]">Kelembaban Tanah</span>
            <span class="font-semibold text-[#4F8936]">{(data()?.moisturePercent ?? 0).toFixed(2)}%</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Debit Air Rata-Rata</span>
            <span class="font-semibold text-[#4F8936]">{(data()?.flowLmin ?? 0).toFixed(2)} L / Menit</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Total Volume Air</span>
            <span class="font-semibold text-[#4F8936]">{(data()?.totalVolumeLiter ?? 0).toFixed(2)} Liter</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-[#4F4F4F]">Pompa</span>
            <Badge tone={pumpBadgeTone(data()?.pumpStatus ?? "OFF")}>{data()?.pumpOn ? "Aktif" : "Mati"}</Badge>
          </div>
        </Show>
      </div>

      <p class="mt-4 text-right text-xs italic text-[#808080]">Terakhir update {formatLastUpdated(lastSeen())}</p>
    </Card>
  );
}
