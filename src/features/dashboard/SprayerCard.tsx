import { Droplets, Gauge, Power, Wind } from "lucide-solid";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Toggle } from "~/components/ui/Toggle";
import type { LiveSprayerData, Threshold } from "~/lib/shared/irrigation";
import { formatLastUpdated, moistureTone, pumpBadgeTone } from "./helpers";

export type SprayerMeta = { id: string; hardwareId: string; displayName: string };

export function SprayerCard(props: {
  data: LiveSprayerData;
  meta?: SprayerMeta;
  threshold: Threshold;
  showWindDirection: boolean;
  showAutoIrrigation: boolean;
  readOnly?: boolean;
  onRelay: (data: LiveSprayerData) => void;
  onMode: (data: LiveSprayerData) => void;
}) {
  const moisture = () => moistureTone(props.data.moisturePercent, props.threshold);

  return (
    <div class="rounded-xl border border-gray-200 bg-white p-5">
      <div class="mb-4">
        <h3 class="text-lg font-bold text-[#4F8936]">{props.meta?.displayName ?? props.data.sprayerId}</h3>
      </div>

      <div class="mb-4 flex items-center justify-between border-b border-[#C2C2C2] pb-4">
        <span class="text-sm font-medium text-[#4F4F4F]">Sensor Data</span>
        <Badge tone="success">Terhubung</Badge>
      </div>

      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2 text-[#4F4F4F]">
            <Gauge size={16} /> Kelembaban Tanah
          </span>
          <span class="font-semibold text-[#186D3C]">{props.data.moisturePercent.toFixed(2)}%</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2 text-[#4F4F4F]">
            <Droplets size={16} /> Debit Air Rata-Rata
          </span>
          <span class="font-semibold text-[#186D3C]">{props.data.flowLmin.toFixed(2)} L / Menit</span>
        </div>
        <Show when={props.showWindDirection}>
          <div class="flex items-center justify-between gap-3">
            <span class="inline-flex items-center gap-2 text-[#4F4F4F]">
              <Wind size={16} /> Arah Angin
            </span>
            <span class="font-semibold text-[#186D3C]">{props.data.windDirection ?? "-"}</span>
          </div>
        </Show>
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2 text-[#4F4F4F]">
            <Power size={16} /> Pompa
          </span>
          <Badge tone={pumpBadgeTone(props.data.pumpStatus)}>{props.data.pumpOn ? "Aktif" : "Mati"}</Badge>
        </div>
      </div>

      <p class="mt-4 text-right text-xs italic text-[#4F4F4F]">
        Terakhir update {formatLastUpdated(props.data.lastUpdated)}
      </p>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#C2C2C2] pt-4">
        <Toggle
          checked={props.data.relay === 1}
          label={props.data.relay === 1 ? "ON" : "OFF"}
          disabled={props.readOnly || !props.meta || props.data.mode === 0}
          onChange={() => props.onRelay(props.data)}
        />
        <Show when={props.showAutoIrrigation}>
          <Toggle
            checked={props.data.mode === 0}
            label="Irigasi Otomatis"
            size="sm"
            disabled={props.readOnly || !props.meta}
            onChange={() => props.onMode(props.data)}
          />
        </Show>
      </div>

      <Show when={props.data.mode === 0}>
        <div class="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
          <span class="font-semibold">Status:</span> {moisture().label}
        </div>
      </Show>
    </div>
  );
}
