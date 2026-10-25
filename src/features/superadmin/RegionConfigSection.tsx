import { createAsync, revalidate } from "@solidjs/router";
import { Search } from "lucide-solid";
import { createEffect, createSignal, ErrorBoundary, For, onCleanup, Show, Suspense } from "solid-js";
import { Card, CardHeader } from "~/components/ui/Card";
import { ariaSort, SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { debounce } from "~/lib/shared/debounce";
import { DEFAULT_PAGE_SIZE, type RegionConfigSortKey } from "~/lib/shared/regionTable";
import type { TableSort } from "~/lib/shared/tableSort";
import { loadRegionsConfig } from "./loaders";
import { RegionConfigRow } from "./RegionConfigRow";

export function RegionConfigSection() {
  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [sort, setSort] = createSignal<TableSort<RegionConfigSortKey> | null>(null);
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(DEFAULT_PAGE_SIZE);

  const commitSearch = debounce((value: string) => {
    setSearch(value.trim());
    setPage(0);
  }, 300);
  onCleanup(() => commitSearch.cancel());

  const regions = createAsync(() =>
    loadRegionsConfig({
      search: search() || undefined,
      sort: sort() ?? undefined,
      limit: pageSize(),
      offset: page() * pageSize(),
    }),
  );

  const total = () => regions()?.total ?? 0;

  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(total() / pageSize()) - 1);
    if (regions() && page() > lastPage) setPage(lastPage);
  });

  const updateSort = (next: TableSort<RegionConfigSortKey>) => {
    setSort(next);
    setPage(0);
  };

  const refresh = async () => {
    await revalidate("superadmin-regions-config");
  };

  const sortableTh = (label: string, column: RegionConfigSortKey) => (
    <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), column)}>
      <SortHeader label={label} column={column} sort={sort()} onSort={updateSort} />
    </th>
  );

  return (
    <Card class="overflow-hidden">
      <CardHeader
        title="Konfigurasi Region"
        actions={
          <div class="flex flex-wrap items-end gap-3">
            <div class="relative w-full min-w-0 sm:w-64">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="search"
                class="form-input h-10 w-full rounded-lg pl-9 pr-3 text-sm"
                placeholder="Cari nama region"
                aria-label="Cari region berdasarkan nama"
                value={searchInput()}
                onInput={(event) => {
                  setSearchInput(event.currentTarget.value);
                  commitSearch(event.currentTarget.value);
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
          </div>
        }
      />
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="p-6 text-center">
            <p class="mb-3 text-sm text-red-600">
              {err instanceof Response ? "Gagal memuat konfigurasi region." : String(err)}
            </p>
            <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
              Coba lagi
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
          <Show when={regions()}>
            {(data) => (
              <Show
                when={data().items.length > 0}
                fallback={
                  <div class="p-8 text-center text-sm text-[#6B6B6B]">
                    {search() ? "Tidak ada region yang cocok." : "Belum ada region."}
                  </div>
                }
              >
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[720px] text-sm">
                    <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                      <tr>
                        {sortableTh("Nama Region", "name")}
                        {sortableTh("Pembagi Volume", "volumeDivider")}
                        {sortableTh("Arah Angin", "showWindDirection")}
                        {sortableTh("Irigasi Otomatis", "showAutoIrrigation")}
                        <th class="whitespace-nowrap px-5 py-3 text-left" />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={data().items}>{(region) => <RegionConfigRow region={region} onSaved={refresh} />}</For>
                    </tbody>
                  </table>
                </div>
                <TablePagination page={page()} pageSize={pageSize()} total={data().total} onPageChange={setPage} />
              </Show>
            )}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </Card>
  );
}
