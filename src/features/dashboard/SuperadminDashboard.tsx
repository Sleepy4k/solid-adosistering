import { A } from "@solidjs/router";
import { Blocks, Map, MapPin, ShieldCheck, Users } from "lucide-solid";
import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card, CardHeader } from "~/components/ui/Card";
import { MetricCard } from "~/components/ui/MetricCard";
import { LeafletMap, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import type { SuperadminSummary } from "./DashboardTypes";
import { syncLabel, syncTone } from "./helpers";

export function SuperadminDashboard(props: { summary: SuperadminSummary }) {
  const summary = () => props.summary;

  const regionMarkers = (): LeafletRegionMarker[] =>
    summary()
      .regions.filter((r) => r.latitude !== null && r.longitude !== null)
      .map((r) => ({ id: r.id, name: r.name, lat: r.latitude!, lng: r.longitude! }));

  return (
    <div class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Wilayah" value={summary().totalRegions} icon={<MapPin size={22} />} />
        <MetricCard label="Total Blok" value={summary().totalBlocks} icon={<Blocks size={22} />} />
        <MetricCard label="Admin Aktif" value={summary().totalAdmins} icon={<ShieldCheck size={22} />} />
        <MetricCard label="Petani Aktif" value={summary().totalUsers} icon={<Users size={22} />} />
      </div>

      <Show when={regionMarkers().length > 0}>
        <Card class="overflow-hidden">
          <CardHeader
            title={
              <span class="inline-flex items-center gap-2">
                <Map size={20} />
                Peta Titik Wilayah
              </span>
            }
          />
          <LeafletMap markers={regionMarkers()} polygons={[]} class="h-80" />
        </Card>
      </Show>

      <Card class="overflow-hidden">
        <CardHeader
          title="Ringkasan Wilayah"
          actions={
            <A href="/region-management" class="text-sm font-medium text-[#186D3C] hover:underline">
              Kelola Region
            </A>
          }
        />
        <Show
          when={summary().regions.length > 0}
          fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Belum ada region.</div>}
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                <tr>
                  <th class="px-5 py-3 text-left">Nama Wilayah</th>
                  <th class="px-5 py-3 text-left">Blok</th>
                  <th class="px-5 py-3 text-left">Admin</th>
                  <th class="px-5 py-3 text-left">Sinkronisasi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <For each={summary().regions}>
                  {(region) => (
                    <tr class="hover:bg-gray-50">
                      <td class="px-5 py-3">
                        <p class="font-medium text-[#333]">{region.name}</p>
                        <p class="text-xs text-[#808080]">{region.description ?? "-"}</p>
                      </td>
                      <td class="px-5 py-3 text-[#4F4F4F]">{region.blockCount}</td>
                      <td class="px-5 py-3 text-[#4F4F4F]">{region.adminCount}</td>
                      <td class="px-5 py-3">
                        <Badge tone={syncTone(region.syncStatus)}>{syncLabel(region.syncStatus)}</Badge>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Card>
    </div>
  );
}
