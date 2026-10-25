import { A, createAsync, query } from "@solidjs/router";
import { Blocks, Map, MapPin, RotateCcw, Search, ShieldCheck, Users } from "lucide-solid";
import { createEffect, createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card, CardHeader } from "~/components/ui/Card";
import { MetricCard } from "~/components/ui/MetricCard";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { ariaSort, SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { LeafletMap, type LeafletRegionMarker } from "~/components/shared/LeafletMap";
import { debounce } from "~/lib/shared/debounce";
import { DEFAULT_PAGE_SIZE, type RegionSummarySortKey } from "~/lib/shared/regionTable";
import type { TableSort } from "~/lib/shared/tableSort";
import { getSuperadminRegions, type SuperadminRegionQuery } from "~/server/actions/dashboard";
import type { SuperadminSummary } from "./DashboardTypes";
import { syncLabel, syncTone } from "./helpers";

const SYNC_FILTER_OPTIONS = [
  { value: "", label: "Semua Sinkronisasi" },
  { value: "SYNCED", label: "Tersinkron" },
  { value: "PENDING", label: "Menunggu" },
  { value: "FAILED", label: "Gagal" },
];

const loadSuperadminRegions = query((q: SuperadminRegionQuery) => getSuperadminRegions(q), "superadmin-region-summary");

export function SuperadminDashboard(props: { summary: SuperadminSummary }) {
  const summary = () => props.summary;

  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [syncFilter, setSyncFilter] = createSignal<string>("");
  const [sort, setSort] = createSignal<TableSort<RegionSummarySortKey> | null>(null);
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(DEFAULT_PAGE_SIZE);

  const commitSearch = debounce((value: string) => {
    setSearch(value.trim());
    setPage(0);
  }, 300);
  onCleanup(() => commitSearch.cancel());

  const regions = createAsync(() =>
    loadSuperadminRegions({
      search: search() || undefined,
      syncStatus: (syncFilter() || undefined) as SuperadminRegionQuery["syncStatus"],
      sort: sort() ?? undefined,
      limit: pageSize(),
      offset: page() * pageSize(),
    }),
  );
  const rows = () => regions()?.items ?? [];
  const total = () => regions()?.total ?? 0;
  const hasFilters = () => searchInput().trim() !== "" || syncFilter() !== "";

  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(total() / pageSize()) - 1);
    if (regions() && page() > lastPage) setPage(lastPage);
  });

  const updateSort = (next: TableSort<RegionSummarySortKey>) => {
    setSort(next);
    setPage(0);
  };
  const resetFilters = () => {
    commitSearch.cancel();
    setSearchInput("");
    setSearch("");
    setSyncFilter("");
    setPage(0);
  };

  const sortableTh = (label: string, column: RegionSummarySortKey) => (
    <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), column)}>
      <SortHeader label={label} column={column} sort={sort()} onSort={updateSort} />
    </th>
  );

  const regionMarkers = (): LeafletRegionMarker[] =>
    summary().markers.map((r) => ({ id: r.id, name: r.name, lat: r.latitude, lng: r.longitude }));

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
        <div class="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-end">
          <div class="relative min-w-0 flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="search"
              class="form-input h-10 w-full rounded-lg pl-9 pr-3 text-sm"
              placeholder="Cari nama atau deskripsi wilayah"
              aria-label="Cari wilayah berdasarkan nama atau deskripsi"
              value={searchInput()}
              onInput={(event) => {
                setSearchInput(event.currentTarget.value);
                commitSearch(event.currentTarget.value);
              }}
            />
          </div>
          <div class="w-full sm:w-52">
            <SimpleSelect
              value={syncFilter()}
              options={SYNC_FILTER_OPTIONS}
              align="end"
              onChange={(value) => {
                setSyncFilter(value);
                setPage(0);
              }}
            />
          </div>
          <PageSizeSelect
            value={pageSize()}
            onChange={(value) => {
              setPageSize(value);
              setPage(0);
            }}
          />
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasFilters()}
            class="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
        </div>
        <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
          <Show
            when={rows().length > 0}
            fallback={
              <div class="p-8 text-center text-sm text-[#6B6B6B]">
                {hasFilters() ? "Tidak ada wilayah yang cocok dengan filter." : "Belum ada region."}
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full min-w-[640px] text-sm">
                <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                  <tr>
                    {sortableTh("Nama Wilayah", "name")}
                    {sortableTh("Deskripsi", "description")}
                    {sortableTh("Blok", "blocks")}
                    {sortableTh("Admin", "admins")}
                    {sortableTh("Sinkronisasi", "firebaseSyncStatus")}
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <For each={rows()}>
                    {(region) => (
                      <tr class="hover:bg-gray-50">
                        <td class="px-5 py-3">
                          <p class="font-medium text-[#333]">{region.name}</p>
                        </td>
                        <td class="max-w-[18rem] px-5 py-3">
                          <p class="break-anywhere line-clamp-2 text-xs text-[#808080]">{region.description ?? "-"}</p>
                        </td>
                        <td class="whitespace-nowrap px-5 py-3 text-[#4F4F4F]">{region.blockCount}</td>
                        <td class="whitespace-nowrap px-5 py-3 text-[#4F4F4F]">{region.adminCount}</td>
                        <td class="whitespace-nowrap px-5 py-3">
                          <Badge tone={syncTone(region.syncStatus)}>{syncLabel(region.syncStatus)}</Badge>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
          <TablePagination page={page()} pageSize={pageSize()} total={total()} onPageChange={setPage} />
        </Suspense>
      </Card>
    </div>
  );
}
