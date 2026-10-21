import { CalendarClock, Droplets, Gauge, Power, Wind } from "lucide-solid";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Toggle } from "~/components/ui/Toggle";
import { formatJakartaDateTime } from "~/lib/shared/datetime";
import type { LiveSprayerData, Threshold } from "~/lib/shared/irrigation";
import { deriveLiveStatus, formatLastUpdated, liveStatusMeta, moistureTone, pumpBadgeTone } from "./helpers";

export type SprayerMeta = {
  id: string;
  hardwareId: string;
  displayName: string;
  lastWateredAt?: string | null;
};

export function SprayerCard(props: {
  data: LiveSprayerData | null;
  meta?: SprayerMeta;
  nowMs: number;
  monitorError?: boolean;
  threshold: Threshold;
  showWindDirection: boolean;
  showAutoIrrigation: boolean;
  readOnly?: boolean;
  onRelay: (data: LiveSprayerData) => void;
  onMode: (data: LiveSprayerData) => void;
}) {
  const status = () => deriveLiveStatus(props.data, props.nowMs, props.monitorError);
  const statusMeta = () => liveStatusMeta(status());
  const moisture = () => moistureTone(props.data?.moisturePercent ?? 0, props.threshold);
  // Only show the last watering event while water is actually flowing; a stale
  // event timestamp from yesterday must not read as current activity.
  const lastWateredAt = () => (status() === "watering" ? (props.meta?.lastWateredAt ?? null) : null);

  return (
    <div class="rounded-xl border border-gray-200 bg-white p-5">
      <div class="mb-4">
        <h3 class="break-words text-lg font-bold text-[#4F8936]">
          {props.meta?.displayName ?? props.data?.sprayerId ?? "Sprayer"}
        </h3>
      </div>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#C2C2C2] pb-4">
        <span class="text-sm font-medium text-[#4F4F4F]">Sensor Data</span>
        <Badge tone={statusMeta().tone}>{statusMeta().label}</Badge>
      </div>

      <Show when={status() === "offline"}>
        <p class="mb-3 text-xs text-[#808080]">
          Perangkat tidak mengirim data ke Firebase. Nilai di bawah adalah pembacaan terakhir.
        </p>
      </Show>
      <Show when={status() === "unknown"}>
        <p class="mb-3 text-xs text-[#808080]">Pemantauan Firebase tidak tersedia.</p>
      </Show>

      <div class="space-y-3 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span class="inline-flex min-w-0 items-center gap-2 text-[#4F4F4F]">
            <Gauge size={16} class="shrink-0" /> Kelembaban Tanah
          </span>
          <span class="min-w-0 break-words text-right font-semibold text-[#186D3C]">
            {props.data ? `${props.data.moisturePercent.toFixed(2)}%` : "-"}
          </span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span class="inline-flex min-w-0 items-center gap-2 text-[#4F4F4F]">
            <Droplets size={16} class="shrink-0" /> Debit Air Rata-Rata
          </span>
          <span class="min-w-0 break-words text-right font-semibold text-[#186D3C]">
            {props.data ? `${props.data.flowLmin.toFixed(2)} L / Menit` : "-"}
          </span>
        </div>
        <Show when={props.showWindDirection}>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span class="inline-flex min-w-0 items-center gap-2 text-[#4F4F4F]">
              <Wind size={16} class="shrink-0" /> Arah Angin
            </span>
            <span class="min-w-0 break-words text-right font-semibold text-[#186D3C]">
              {props.data ? (props.data.windDirection ?? "-") : "-"}
            </span>
          </div>
        </Show>
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span class="inline-flex min-w-0 items-center gap-2 text-[#4F4F4F]">
            <Power size={16} class="shrink-0" /> Pompa
          </span>
          <Show when={props.data} fallback={<Badge tone="muted">Tidak Diketahui</Badge>}>
            {(data) => <Badge tone={pumpBadgeTone(data().pumpStatus)}>{data().pumpOn ? "Aktif" : "Mati"}</Badge>}
          </Show>
        </div>
        <Show when={lastWateredAt()}>
          {(value) => (
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span class="inline-flex min-w-0 items-center gap-2 text-[#4F4F4F]">
                <CalendarClock size={16} class="shrink-0" /> Terakhir siram
              </span>
              <span class="min-w-0 break-words text-right font-semibold text-[#186D3C]">
                {formatJakartaDateTime(value())}
              </span>
            </div>
          )}
        </Show>
      </div>

      <Show when={status() === "no-flow"}>
        <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p class="font-semibold">Pompa menyala, tetapi tidak ada aliran air terdeteksi.</p>
          <p class="mt-1">Kemungkinan air habis, pompa kering, keran tertutup, atau sensor debit bermasalah.</p>
        </div>
      </Show>

      <p class="mt-4 text-right text-xs italic text-[#4F4F4F]">
        Terakhir update {formatLastUpdated(props.data?.lastUpdated ?? null, props.nowMs)}
      </p>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#C2C2C2] pt-4">
        <Toggle
          checked={props.data?.relay === 1}
          label={props.data?.relay === 1 ? "ON" : "OFF"}
          disabled={props.readOnly || !props.meta || !props.data || props.data.mode === 0}
          onChange={() => {
            const data = props.data;
            if (data) props.onRelay(data);
          }}
        />
        <Show when={props.showAutoIrrigation}>
          <Toggle
            checked={props.data?.mode === 0}
            label="Irigasi Otomatis"
            size="sm"
            disabled={props.readOnly || !props.meta || !props.data}
            onChange={() => {
              const data = props.data;
              if (data) props.onMode(data);
            }}
          />
        </Show>
      </div>

      <Show when={props.data?.mode === 0}>
        <div class="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
          <span class="font-semibold">Status:</span> {moisture().label}
        </div>
      </Show>
    </div>
  );
}
