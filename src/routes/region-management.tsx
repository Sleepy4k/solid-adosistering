import { query, createAsync, revalidate } from "@solidjs/router";
import { createEffect, createSignal, For, lazy, onCleanup, Show, Suspense } from "solid-js";
import { Download, Plus, RotateCcw, Search } from "lucide-solid";
import { ExportDataModal } from "~/features/export/ExportDataModal";
import { PageMeta } from "~/components/shared/PageMeta";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { ariaSort, SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { Badge } from "~/components/ui/Badge";
import { getRegions, deleteRegion, type RegionListQuery } from "~/server/actions/regions";
import { setRegionAutomaticMode } from "~/server/actions/settings";
import { SkTableRow } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { debounce } from "~/lib/shared/debounce";
import { DEFAULT_PAGE_SIZE, type RegionListSortKey } from "~/lib/shared/regionTable";
import type { TableSort } from "~/lib/shared/tableSort";

type RegionRow = Awaited<ReturnType<typeof getRegions>>["items"][number];

const RegionModal = lazy(() =>
  import("~/features/region-management/RegionModal").then((m) => ({ default: m.RegionModal })),
);
const AdminAssignModal = lazy(() =>
  import("~/features/region-management/AdminAssignModal").then((m) => ({ default: m.AdminAssignModal })),
);

const SYNC_BADGES: Record<string, { label: string; cls: string }> = {
  SYNCED: { label: "Tersinkron", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  FAILED: { label: "Gagal", cls: "bg-rose-100 text-rose-700" },
};

const SYNC_FILTER_OPTIONS = [
  { value: "", label: "Semua Firebase" },
  { value: "SYNCED", label: "Tersinkron" },
  { value: "PENDING", label: "Menunggu" },
  { value: "FAILED", label: "Gagal" },
];
const MODE_FILTER_OPTIONS = [
  { value: "", label: "Semua Mode" },
  { value: "on", label: "Otomatis Aktif" },
  { value: "off", label: "Otomatis Nonaktif" },
];

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

const loadRegions = query((q: RegionListQuery) => getRegions(q), "regions-list");
export const route = {
  preload: () => loadRegions({ limit: DEFAULT_PAGE_SIZE, offset: 0 }),
};

export default function ManajemenRegion() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [editTarget, setEditTarget] = createSignal<RegionRow | null>(null);
  const [showCreate, setShowCreate] = createSignal<boolean>(false);
  const [exportOpen, setExportOpen] = createSignal<boolean>(false);
  const [adminTarget, setAdminTarget] = createSignal<RegionRow | null>(null);
  const [refreshKey, setRefreshKey] = createSignal<number>(0);
  const [loadError, setLoadError] = createSignal<string>("");
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(DEFAULT_PAGE_SIZE);
  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [syncFilter, setSyncFilter] = createSignal<string>("");
  const [modeFilter, setModeFilter] = createSignal<string>("");
  const [sort, setSort] = createSignal<TableSort<RegionListSortKey> | null>(null);
  const [modePendingId, setModePendingId] = createSignal<string | null>(null);

  const commitSearch = debounce((value: string) => {
    setSearch(value.trim());
    setPage(0);
  }, 300);
  onCleanup(() => commitSearch.cancel());

  const regions = createAsync(async () => {
    void refreshKey();
    setLoadError("");
    const sortState = sort();
    try {
      return await loadRegions({
        search: search() || undefined,
        syncStatus: (syncFilter() || undefined) as RegionListQuery["syncStatus"],
        automaticMode: (modeFilter() || undefined) as RegionListQuery["automaticMode"],
        sort: sortState ?? undefined,
        limit: pageSize(),
        offset: page() * pageSize(),
      });
    } catch (error) {
      setLoadError(!import.meta.env.PROD && error instanceof Error ? error.message : "Data region belum bisa dimuat.");
      return { items: [], total: 0 };
    }
  });
  const regionRows = () => regions()?.items ?? [];
  const total = () => regions()?.total ?? 0;
  const hasFilters = () => searchInput().trim() !== "" || syncFilter() !== "" || modeFilter() !== "";

  // Land on the last page when a delete or filter leaves the current page empty.
  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(total() / pageSize()) - 1);
    // A failed load returns an empty placeholder: it must not look like an emptied page.
    if (regions() && !loadError() && page() > lastPage) setPage(lastPage);
  });

  const updateSort = (next: TableSort<RegionListSortKey>) => {
    setSort(next);
    setPage(0);
  };
  const resetFilters = () => {
    commitSearch.cancel();
    setSearchInput("");
    setSearch("");
    setSyncFilter("");
    setModeFilter("");
    setPage(0);
  };

  const handleDelete = async (r: RegionRow) => {
    const ok = await confirm({
      title: "Hapus Region",
      message: `Menghapus "${r.name}" akan menghapus semua blok, sprayer, dan data terkait secara permanen. Lanjutkan?`,
      confirmLabel: "Hapus Permanen",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRegion({ id: r.id });
      notify({ kind: "success", title: `Region "${r.name}" dihapus` });
      setRefreshKey((k) => k + 1);
    } catch {
      notify({ kind: "error", title: "Gagal menghapus region" });
    }
  };

  const handleAutomaticMode = async (r: RegionRow, enabled: boolean) => {
    if (enabled && r.sprayerCount === 0) {
      notify({
        kind: "warning",
        title: "Mode otomatis membutuhkan sprayer aktif",
        message: "Aktifkan atau tambahkan minimal satu sprayer pada region ini terlebih dahulu.",
      });
      return;
    }

    const ok = await confirm({
      title: enabled ? "Aktifkan Mode Otomatis" : "Nonaktifkan Mode Otomatis",
      message: enabled
        ? `Mengaktifkan mode otomatis untuk region "${r.name}" akan memindahkan semua sprayer aktif ke AUTO/OFF. Irigasi dapat menyala secara otomatis berdasarkan kelembapan tanah. Lanjutkan?`
        : `Menonaktifkan mode otomatis untuk region "${r.name}" akan memindahkan semua sprayer aktif ke MANUAL/OFF. Lanjutkan?`,
      confirmLabel: enabled ? "Aktifkan Otomatis" : "Nonaktifkan",
      tone: enabled ? "primary" : "danger",
    });
    if (!ok) return;

    setModePendingId(r.id);
    try {
      const result = await setRegionAutomaticMode({ regionId: r.id, enabled });
      if (result.syncStatus === "FAILED") {
        notify({
          kind: "warning",
          title: "Mode otomatis tersimpan, sinkronisasi Firebase tertunda",
          message:
            "Status utama di database sudah diperbarui, tetapi mirror Firebase gagal atau belum tersinkron. Perangkat dapat memakai mode sebelumnya sampai sinkronisasi berhasil.",
        });
      } else {
        notify({
          kind: "success",
          title: enabled ? `Mode otomatis diaktifkan untuk ${r.name}` : `Mode otomatis dinonaktifkan untuk ${r.name}`,
          message:
            result.sprayerCount > 0
              ? `${result.sprayerCount} sprayer aktif dipindahkan ke ${enabled ? "AUTO/OFF" : "MANUAL/OFF"}.`
              : "Tidak ada sprayer aktif yang perlu dipindahkan.",
        });
      }
    } catch (error) {
      const message =
        error instanceof Response
          ? (await error.text().catch(() => "")) || "Periksa koneksi Anda lalu coba lagi."
          : "Periksa koneksi Anda lalu coba lagi.";
      notify({ kind: "error", title: "Gagal mengubah mode otomatis", message });
      return;
    } finally {
      setModePendingId(null);
    }

    await revalidate("regions-list").catch(() => undefined);
  };

  return (
    <>
      <PageMeta page="regionManagement" />

      <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 class="text-2xl font-bold text-slate-900">Manajemen Region</h1>
          <div class="flex flex-wrap items-end gap-3">
            <PageSizeSelect
              value={pageSize()}
              onChange={(value) => {
                setPageSize(value);
                setPage(0);
              }}
            />
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              class="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download size={16} />
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={16} />
              Tambah Region
            </button>
          </div>
        </div>

        <Show when={loadError()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data region belum bisa dimuat. {loadError()}
          </div>
        </Show>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative min-w-0 flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              class="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Cari nama atau deskripsi region"
              aria-label="Cari region berdasarkan nama atau deskripsi"
              value={searchInput()}
              onInput={(event) => {
                setSearchInput(event.currentTarget.value);
                commitSearch(event.currentTarget.value);
              }}
            />
          </div>
          <div class="w-full sm:w-48">
            <SimpleSelect
              value={syncFilter()}
              options={SYNC_FILTER_OPTIONS}
              onChange={(value) => {
                setSyncFilter(value);
                setPage(0);
              }}
            />
          </div>
          <div class="w-full sm:w-52">
            <SimpleSelect
              value={modeFilter()}
              options={MODE_FILTER_OPTIONS}
              align="end"
              onChange={(value) => {
                setModeFilter(value);
                setPage(0);
              }}
            />
          </div>
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

        <div class="animate-in-soft rounded-xl border border-slate-200 bg-white">
          <Suspense
            fallback={
              <table class="w-full text-sm">
                <tbody>
                  <SkTableRow />
                  <SkTableRow />
                  <SkTableRow />
                </tbody>
              </table>
            }
          >
            <Show
              when={regionRows().length > 0 || total() > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">
                  {hasFilters()
                    ? "Tidak ada region yang cocok dengan filter."
                    : "Belum ada region. Buat region pertama Anda."}
                </div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full min-w-[1100px] text-sm">
                  <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "name")}>
                        <SortHeader label="Nama Region" column="name" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "description")}>
                        <SortHeader label="Deskripsi" column="description" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "blocks")}>
                        <SortHeader label="Blok" column="blocks" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "admins")}>
                        <SortHeader label="Admin" column="admins" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "automaticMode")}>
                        <SortHeader label="Mode Otomatis" column="automaticMode" sort={sort()} onSort={updateSort} />
                      </th>
                      <th
                        class="whitespace-nowrap px-5 py-3 text-left"
                        aria-sort={ariaSort(sort(), "firebaseSyncStatus")}
                      >
                        <SortHeader label="Firebase" column="firebaseSyncStatus" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), "createdAt")}>
                        <SortHeader label="Dibuat" column="createdAt" sort={sort()} onSort={updateSort} />
                      </th>
                      <th class="whitespace-nowrap px-5 py-3 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={regionRows()}>
                      {(region) => {
                        const badge = SYNC_BADGES[region.firebaseSyncStatus] ?? SYNC_BADGES.PENDING;
                        return (
                          <tr class="hover:bg-slate-50">
                            <td class="px-5 py-3">
                              <p class="font-medium text-slate-900">{region.name}</p>
                            </td>
                            <td class="max-w-[16rem] px-5 py-3">
                              <p class="break-anywhere line-clamp-2 text-xs text-slate-500">
                                {region.description ?? "—"}
                              </p>
                            </td>
                            <td class="whitespace-nowrap px-5 py-3 text-slate-600">{region._count.blocks}</td>
                            <td class="px-5 py-3">
                              <Show
                                when={region.adminAssignments.length > 0}
                                fallback={<span class="italic text-xs text-slate-400">Belum ada</span>}
                              >
                                <div class="flex flex-col gap-0.5">
                                  <For each={region.adminAssignments}>
                                    {(a) => <span class="break-anywhere text-xs text-slate-700">{a.admin.name}</span>}
                                  </For>
                                </div>
                              </Show>
                            </td>
                            <td class="px-5 py-3">
                              <div class="flex flex-col gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  <Badge tone={region.automaticMode ? "success" : "muted"}>
                                    {region.automaticMode ? "Aktif" : "Nonaktif"}
                                  </Badge>
                                  <span class="whitespace-nowrap text-xs text-slate-400">
                                    {region.sprayerCount} sprayer aktif
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    modePendingId() !== null || (!region.automaticMode && region.sprayerCount === 0)
                                  }
                                  title={
                                    !region.automaticMode && region.sprayerCount === 0
                                      ? "Aktifkan minimal satu sprayer di region ini untuk memakai mode otomatis."
                                      : undefined
                                  }
                                  onClick={() => handleAutomaticMode(region, !region.automaticMode)}
                                  class={`w-fit rounded-lg border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                                    region.automaticMode
                                      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  }`}
                                >
                                  {modePendingId() === region.id
                                    ? "Menyimpan..."
                                    : region.automaticMode
                                      ? "Nonaktifkan"
                                      : "Aktifkan"}
                                </button>
                              </div>
                            </td>
                            <td class="whitespace-nowrap px-5 py-3">
                              <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td class="whitespace-nowrap px-5 py-3 text-xs text-slate-500">
                              {dateFormat.format(new Date(region.createdAt))}
                            </td>
                            <td class="px-5 py-3">
                              <div class="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditTarget(region)}
                                  class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminTarget(region)}
                                  class="rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                                >
                                  Admin
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(region)}
                                  class="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
              <TablePagination page={page()} pageSize={pageSize()} total={total()} onPageChange={setPage} />
            </Show>
          </Suspense>
        </div>
      </div>

      <Show when={showCreate()}>
        <RegionModal onClose={() => setShowCreate(false)} onSaved={() => setRefreshKey((k) => k + 1)} />
      </Show>
      <Show when={editTarget()}>
        {(r) => (
          <RegionModal initial={r()} onClose={() => setEditTarget(null)} onSaved={() => setRefreshKey((k) => k + 1)} />
        )}
      </Show>
      <Show when={adminTarget()}>
        {(r) => (
          <AdminAssignModal
            region={r()}
            onClose={() => setAdminTarget(null)}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </Show>
      <ExportDataModal
        open={exportOpen()}
        onClose={() => setExportOpen(false)}
        dataset="regions"
        title="Region"
        dateRange="optional"
        dateLabel="Tanggal dibuat"
      />
    </>
  );
}
