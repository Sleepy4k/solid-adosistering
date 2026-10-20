import { A } from "@solidjs/router";
import { AlertTriangle, MapPin, Plus, RotateCcw, Search, Sprout, UserCheck, Users } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Card, CardHeader } from "~/components/ui/Card";
import { MetricCard } from "~/components/ui/MetricCard";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { ROUTES } from "~/constants/routes";
import type { AdminUserCard, DashboardRegion } from "./DashboardTypes";
import { AdminUserSensorCard } from "./AdminUserSensorCard";
import { MapCard } from "./MapCard";

const ACCOUNT_OPTIONS = [
  { value: "", label: "Semua Akun" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
  { value: "attention", label: "Perlu Perhatian" },
];

export function AdminDashboard(props: { users: AdminUserCard[]; regions: DashboardRegion[] }) {
  const [search, setSearch] = createSignal<string>("");
  const [regionFilter, setRegionFilter] = createSignal<string>("");
  const [accountFilter, setAccountFilter] = createSignal<string>("");

  const normalizedSearch = createMemo(() => search().trim().toLowerCase());
  const hasActiveFilters = createMemo(
    () => normalizedSearch().length > 0 || regionFilter().length > 0 || accountFilter().length > 0,
  );

  const regionOptions = createMemo(() => [
    { value: "", label: "Semua Wilayah" },
    ...props.regions.map((region) => ({ value: region.id, label: region.name })),
  ]);

  const activeUsers = createMemo(() => props.users.filter((user) => user.isActive).length);
  const attentionUsers = createMemo(
    () => props.users.filter((user) => !user.isActive || user.sprayersByBlock.length === 0).length,
  );

  const regionSummaries = createMemo(() =>
    props.regions.map((region) => ({
      id: region.id,
      name: region.name,
      blockCount: region.blocks.length,
      sprayerCount: region.blocks.reduce((total, block) => total + block.sprayers.length, 0),
    })),
  );

  // Installed sprayers are physical units tracked per region/block. Counting user assignments
  // double-counts a sprayer shared across users, so derive the KPI from the region inventory.
  const assignedSprayers = createMemo(() =>
    regionSummaries().reduce((total, region) => total + region.sprayerCount, 0),
  );

  // Build each user's lowercased search haystack once per users change instead of on every keystroke.
  const searchIndex = createMemo(() => {
    const index = new Map<string, string>();
    for (const user of props.users) {
      index.set(
        user.id,
        [
          user.name,
          user.email,
          user.city ?? "",
          user.domicile ?? "",
          ...user.regions.map((region) => region.name),
          ...user.sprayersByBlock.map((sprayer) => sprayer.regionName),
          ...user.sprayersByBlock.map((sprayer) => sprayer.hardwareId),
        ]
          .join(" ")
          .toLowerCase(),
      );
    }
    return index;
  });

  const filteredUsers = createMemo(() => {
    const query = normalizedSearch();
    const selectedRegionId = regionFilter();
    const selectedRegion = selectedRegionId
      ? props.regions.find((region) => region.id === selectedRegionId)
      : undefined;
    const account = accountFilter();
    const haystacks = searchIndex();

    return props.users.filter((user) => {
      if (account === "active" && !user.isActive) return false;
      if (account === "inactive" && user.isActive) return false;
      if (account === "attention" && user.isActive && user.sprayersByBlock.length > 0) return false;

      if (selectedRegionId && selectedRegion) {
        const inRegion =
          user.regions.some((region) => region.id === selectedRegionId || region.name === selectedRegion.name) ||
          user.sprayersByBlock.some((sprayer) => sprayer.regionName === selectedRegion.name);
        if (!inRegion) return false;
      }

      if (query && !haystacks.get(user.id)?.includes(query)) return false;
      return true;
    });
  });

  const resetFilters = () => {
    setSearch("");
    setRegionFilter("");
    setAccountFilter("");
  };

  return (
    <div class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Pengguna" value={props.users.length} icon={<Users size={22} />} />
        <MetricCard label="Pengguna Aktif" value={activeUsers()} icon={<UserCheck size={22} />} />
        <MetricCard label="Perlu Perhatian" value={attentionUsers()} icon={<AlertTriangle size={22} />} />
        <MetricCard label="Sprayer Terpasang" value={assignedSprayers()} icon={<Sprout size={22} />} />
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
                      onClick={() => setRegionFilter(region.id)}
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
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#C2C2C2] bg-white px-4 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={resetFilters}
                disabled={!hasActiveFilters()}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Reset
              </button>
              <A
                href={ROUTES.userCreate}
                class="btn-3d-green inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-medium text-white"
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
                options={regionOptions()}
                onChange={setRegionFilter}
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
                onChange={setAccountFilter}
              />
            </div>
          </div>
        </div>
      </Card>

      <section class="space-y-3" aria-labelledby="admin-users-heading">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="admin-users-heading" class="text-lg font-bold text-[#4F4F4F]">
            Daftar Pengguna
          </h2>
          <p class="text-sm text-[#6B6B6B]" aria-live="polite">
            Menampilkan <span class="font-semibold text-[#333]">{filteredUsers().length}</span> dari{" "}
            {props.users.length} pengguna
          </p>
        </div>

        <Show
          when={filteredUsers().length > 0}
          fallback={
            <Card class="p-10 text-center">
              <Show
                when={props.users.length > 0}
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
            <For each={filteredUsers()}>{(user) => <AdminUserSensorCard user={user} />}</For>
          </div>
        </Show>
      </section>
    </div>
  );
}
