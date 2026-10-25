import { A, createAsync, query } from "@solidjs/router";
import { AlertTriangle, MapPin, Plus, RotateCcw, Search, Sprout, UserCheck, Users } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card, CardHeader } from "~/components/ui/Card";
import { MetricCard } from "~/components/ui/MetricCard";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { searchRegionOptions } from "~/server/actions/options";
import { SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { debounce } from "~/lib/shared/debounce";
import { ADMIN_USER_SORT_KEYS, DEFAULT_PAGE_SIZE, type AdminUserSortKey } from "~/lib/shared/regionTable";
import type { TableSort } from "~/lib/shared/tableSort";
import { getAdminUsers, type AdminUsersQuery } from "~/server/actions/dashboard";
import { ROUTES } from "~/constants/routes";
import type { AdminDashboardStats, DashboardRegion } from "./DashboardTypes";
import { AdminUserSensorCard } from "./AdminUserSensorCard";
import { MapCard } from "./MapCard";

const ACCOUNT_OPTIONS = [
  { value: "", label: "Semua Akun" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
  { value: "attention", label: "Perlu Perhatian" },
];

const SORT_LABELS: Record<AdminUserSortKey, string> = {
  name: "Nama",
  email: "Email",
  city: "Kota",
  isActive: "Status Akun",
  createdAt: "Terdaftar",
};

const loadAdminUsers = query((q: AdminUsersQuery) => getAdminUsers(q), "admin-dashboard-users");

export function AdminDashboard(props: { regions: DashboardRegion[]; stats: AdminDashboardStats }) {
  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [regionFilter, setRegionFilter] = createSignal<string>("");
  const [accountFilter, setAccountFilter] = createSignal<string>("");
  const [sort, setSort] = createSignal<TableSort<AdminUserSortKey> | null>(null);
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(DEFAULT_PAGE_SIZE);

  // Search, filters, sort and paging all run on the server; the browser only
  // holds the current page of user cards (and subscribes to those cards only).
  const commitSearch = debounce((value: string) => {
    setSearch(value.trim());
    setPage(0);
  }, 300);
  onCleanup(() => commitSearch.cancel());

  const users = createAsync(() =>
    loadAdminUsers({
      search: search() || undefined,
      regionId: regionFilter() || undefined,
      account: (accountFilter() || undefined) as AdminUsersQuery["account"],
      sort: sort() ?? undefined,
      limit: pageSize(),
      offset: page() * pageSize(),
    }),
  );
  const userRows = () => users()?.items ?? [];
  const total = () => users()?.total ?? 0;

  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(total() / pageSize()) - 1);
    if (users() && page() > lastPage) setPage(lastPage);
  });

  const hasActiveFilters = createMemo(
    () => searchInput().trim().length > 0 || regionFilter().length > 0 || accountFilter().length > 0,
  );

  const updateSort = (next: TableSort<AdminUserSortKey>) => {
    setSort(next);
    setPage(0);
  };
  const updateRegionFilter = (value: string) => {
    setRegionFilter(value);
    setPage(0);
  };
  const updateAccountFilter = (value: string) => {
    setAccountFilter(value);
    setPage(0);
  };

  const regionSummaries = createMemo(() =>
    props.regions.map((region) => ({
      id: region.id,
      name: region.name,
      blockCount: region.blocks.length,
      sprayerCount: region.blocks.reduce((total, block) => total + block.sprayers.length, 0),
    })),
  );

  const resetFilters = () => {
    commitSearch.cancel();
    setSearchInput("");
    setSearch("");
    setRegionFilter("");
    setAccountFilter("");
    setPage(0);
  };

  return (
    <div class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Pengguna" value={props.stats.totalUsers} icon={<Users size={22} />} />
        <MetricCard label="Pengguna Aktif" value={props.stats.activeUsers} icon={<UserCheck size={22} />} />
        <MetricCard label="Perlu Perhatian" value={props.stats.attentionUsers} icon={<AlertTriangle size={22} />} />
        <MetricCard label="Sprayer Terpasang" value={props.stats.sprayerCount} icon={<Sprout size={22} />} />
      </div>

      <div class="grid gap-4 xl:grid-cols-5">
        <div class="min-w-0 xl:col-span-3">
          <MapCard regions={props.regions} />
        </div>

        <Card class="flex h-full flex-col overflow-hidden xl:col-span-2">
          <CardHeader
            title={
              <span class="inline-flex items-center gap-2">
                <MapPin size={20} />
                Region Anda
              </span>
            }
            actions={<span class="text-xs font-medium text-[#808080]">{regionSummaries().length} wilayah</span>}
          />
          <Show
            when={regionSummaries().length > 0}
            fallback={<div class="flex-1 p-8 text-center text-sm text-[#6B6B6B]">Belum ada wilayah.</div>}
          >
            <ul class="max-h-64 flex-1 divide-y divide-gray-100 overflow-y-auto">
              <For each={regionSummaries()}>
                {(region) => (
                  <li>
                    <button
                      type="button"
                      class={`flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left transition-colors hover:bg-[#F4F8F1] ${
                        regionFilter() === region.id ? "bg-[#EEF6E9]" : ""
                      }`}
                      aria-pressed={regionFilter() === region.id}
                      aria-label={`Filter pengguna wilayah ${region.name}`}
                      onClick={() => updateRegionFilter(region.id)}
                    >
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-semibold text-[#4F4F4F]">{region.name}</span>
                        <span class="block text-xs text-[#808080]">Filter pengguna wilayah ini</span>
                      </span>
                      <span class="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Badge tone="muted">{region.blockCount} blok</Badge>
                        <Badge tone="success">{region.sprayerCount} sprayer</Badge>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <div class="mt-auto flex flex-wrap gap-2 border-t border-[#D4D4D4] p-4">
            <A
              href={ROUTES.userManagement}
              class="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-[#C2C2C2] px-3 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50"
            >
              Kelola Pengguna
            </A>
            <A
              href={ROUTES.userCreate}
              class="btn-3d-green inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-3 text-sm font-medium text-white"
            >
              <Plus size={16} />
              Tambah Pengguna
            </A>
          </div>
        </Card>
      </div>

      <Card class="p-4">
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="relative min-w-0 flex-1">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="search"
                class="form-input h-11 w-full rounded-xl pl-9 pr-3 text-sm"
                placeholder="Cari nama, email, kota, wilayah, atau ID hardware"
                aria-label="Cari pengguna berdasarkan nama, email, kota, wilayah, atau ID hardware"
                value={searchInput()}
                onInput={(event) => {
                  setSearchInput(event.currentTarget.value);
                  commitSearch(event.currentTarget.value);
                }}
              />
            </div>
            <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <button
                type="button"
                class="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#C2C2C2] bg-white px-4 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                onClick={resetFilters}
                disabled={!hasActiveFilters()}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Reset
              </button>
              <A
                href={ROUTES.userCreate}
                class="btn-3d-green inline-flex h-11 flex-1 items-center justify-center gap-2 px-4 text-sm font-medium text-white sm:flex-none"
              >
                <Plus size={16} />
                Tambah Pengguna
              </A>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div role="group" aria-labelledby="admin-region-filter-label">
              <span id="admin-region-filter-label" class="mb-1 block text-xs font-medium text-[#6B6B6B]">
                Wilayah
              </span>
              <SelectSearch
                value={regionFilter()}
                placeholder="Semua Wilayah"
                searchPlaceholder="Cari wilayah..."
                selectedLabel={props.regions.find((region) => region.id === regionFilter())?.name}
                loadOptions={(q) => searchRegionOptions({ query: q, limit: 50 })}
                onChange={updateRegionFilter}
              />
            </div>
            <div role="group" aria-labelledby="admin-account-filter-label">
              <span id="admin-account-filter-label" class="mb-1 block text-xs font-medium text-[#6B6B6B]">
                Status Akun
              </span>
              <SelectSearch
                value={accountFilter()}
                placeholder="Semua Akun"
                searchPlaceholder="Cari status..."
                options={ACCOUNT_OPTIONS}
                align="end"
                onChange={updateAccountFilter}
              />
            </div>
          </div>
        </div>
      </Card>

      <section class="space-y-3" aria-labelledby="admin-users-heading">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h2 id="admin-users-heading" class="text-lg font-bold text-[#4F4F4F]">
            Daftar Pengguna
          </h2>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Urutkan pengguna">
            <span class="text-xs font-medium text-[#6B6B6B]">Urutkan:</span>
            <For each={ADMIN_USER_SORT_KEYS}>
              {(key) => (
                <SortHeader
                  class="text-xs text-[#6B6B6B]"
                  label={SORT_LABELS[key]}
                  column={key}
                  sort={sort()}
                  onSort={updateSort}
                />
              )}
            </For>
          </div>
          <PageSizeSelect
            value={pageSize()}
            onChange={(value) => {
              setPageSize(value);
              setPage(0);
            }}
          />
        </div>

        <Suspense fallback={<Card class="p-10 text-center text-sm text-[#6B6B6B]">Memuat pengguna...</Card>}>
          <Show
            when={userRows().length > 0}
            fallback={
              <Card class="p-10 text-center">
                <Show
                  when={hasActiveFilters() || props.stats.totalUsers > 0}
                  fallback={
                    <>
                      <p class="text-sm text-[#6B6B6B]">Belum ada pengguna yang terdaftar.</p>
                      <A
                        href={ROUTES.userCreate}
                        class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#186D3C] hover:underline"
                      >
                        <Plus size={16} />
                        Tambah Pengguna
                      </A>
                    </>
                  }
                >
                  <p class="text-sm font-semibold text-[#4F4F4F]">Tidak ada pengguna yang cocok dengan filter.</p>
                  <p class="mt-1 text-sm text-[#6B6B6B]">
                    Ubah kata kunci atau reset filter untuk melihat semua pengguna.
                  </p>
                  <button
                    type="button"
                    class="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#C2C2C2] px-4 py-2 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50"
                    onClick={resetFilters}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Reset Filter
                  </button>
                </Show>
              </Card>
            }
          >
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <For each={userRows()}>{(user) => <AdminUserSensorCard user={user} />}</For>
            </div>
          </Show>
          <Card class="overflow-hidden">
            <TablePagination page={page()} pageSize={pageSize()} total={total()} onPageChange={setPage} />
          </Card>
        </Suspense>
      </section>
    </div>
  );
}
