import { query, createAsync } from "@solidjs/router";
import type { ActivityAction } from "@prisma/client";
import { createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import { Download, RotateCcw, Search } from "lucide-solid";
import { ExportDataModal } from "~/features/export/ExportDataModal";
import { SkTableRow } from "~/components/shared/Skeleton";
import { DatePicker } from "~/components/ui/DatePicker";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { ariaSort, SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import ActionBadge from "~/features/logs/ActionBadge";
import { getActivityLogs, type ActivityLogRow } from "~/server/actions/logs";
import { ACTION_LABELS, AUTH_ACTIONS, type LogSortKey } from "~/constants/activity-log";
import { debounce } from "~/lib/shared/debounce";
import type { TableSort } from "~/lib/shared/tableSort";

type ActivityLogResult = Awaited<ReturnType<typeof getActivityLogs>>;
type Category = "auth" | "system";

type LogQuery = {
  category: Category;
  action: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  sortKey: string;
  sortDir: string;
  pageSize: number;
  offset: number;
};

export const loadLogs = query(
  (q: LogQuery) =>
    getActivityLogs({
      category: q.category,
      action: q.action || undefined,
      search: q.search || undefined,
      dateFrom: q.dateFrom || undefined,
      dateTo: q.dateTo || undefined,
      sortKey: q.sortKey,
      sortDir: q.sortDir,
      limit: q.pageSize,
      offset: q.offset,
    }),
  "activity-logs",
);

export const preloadLogs = (category: Category) =>
  loadLogs({
    category,
    action: "",
    search: "",
    dateFrom: "",
    dateTo: "",
    sortKey: "createdAt",
    sortDir: "desc",
    pageSize: 10,
    offset: 0,
  });

function formatDate(d: Date) {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ActivityLogTable(props: { category: Category; title: string }) {
  const [actionFilter, setActionFilter] = createSignal<string>("");
  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [dateFrom, setDateFrom] = createSignal<string>("");
  const [dateTo, setDateTo] = createSignal<string>("");
  const [sort, setSort] = createSignal<TableSort<LogSortKey>>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(10);
  const [exportOpen, setExportOpen] = createSignal<boolean>(false);

  const data = createAsync<ActivityLogResult>(() =>
    loadLogs({
      category: props.category,
      action: actionFilter(),
      search: search(),
      dateFrom: dateFrom(),
      dateTo: dateTo(),
      sortKey: sort().key,
      sortDir: sort().dir,
      pageSize: pageSize(),
      offset: page() * pageSize(),
    }),
  );

  const applySearch = debounce((value: string) => {
    setSearch(value.trim());
    setPage(0);
  }, 300);
  onCleanup(() => applySearch.cancel());

  const actionOptions = () => {
    const entries = Object.entries(ACTION_LABELS) as [ActivityAction, string][];
    const filtered = entries.filter(([value]) =>
      props.category === "auth" ? AUTH_ACTIONS.includes(value) : !AUTH_ACTIONS.includes(value),
    );
    return [{ value: "", label: "Semua Aksi" }, ...filtered.map(([value, label]) => ({ value, label }))];
  };

  const reset = () => {
    applySearch.cancel();
    setActionFilter("");
    setSearchInput("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSort({ key: "createdAt", dir: "desc" });
    setPage(0);
  };

  const onSort = (next: TableSort<LogSortKey>) => {
    setSort(next);
    setPage(0);
  };

  const th = (label: string, column: LogSortKey) => (
    <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(sort(), column)}>
      <SortHeader label={label} column={column} sort={sort()} onSort={onSort} />
    </th>
  );

  const activeFilterNote = () => (actionFilter() ? "Filter tipe aksi yang aktif ikut diterapkan." : undefined);

  return (
    <>
      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">{props.title}</h1>

        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:min-w-56">
            <label class="text-xs font-medium text-slate-600">Cari</label>
            <div class="relative">
              <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput()}
                placeholder="Aktor, entitas, ID, IP..."
                maxLength={100}
                onInput={(e) => {
                  setSearchInput(e.currentTarget.value);
                  applySearch(e.currentTarget.value);
                }}
                class="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          <div class="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:min-w-56">
            <label class="text-xs font-medium text-slate-600">Tipe Aksi</label>
            <SelectSearch
              value={actionFilter()}
              placeholder="Semua Aksi"
              options={actionOptions()}
              onChange={(value) => {
                setActionFilter(value);
                setPage(0);
              }}
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Dari</label>
            <DatePicker
              value={dateFrom()}
              placeholder="Dari tanggal"
              onChange={(value) => {
                setDateFrom(value);
                setPage(0);
              }}
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Sampai</label>
            <DatePicker
              value={dateTo()}
              placeholder="Sampai tanggal"
              onChange={(value) => {
                setDateTo(value);
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
            onClick={reset}
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Download size={16} />
            Export
          </button>
          <Suspense>
            <Show when={data()}>
              {(d) => (
                <span class="ml-auto text-sm text-slate-500">
                  Total: <strong>{d().total}</strong> entri
                </span>
              )}
            </Show>
          </Suspense>
        </div>

        <Show when={data()?.forbidden}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            Anda tidak memiliki akses ke log ini.
          </div>
        </Show>

        <div class="rounded-xl border border-slate-200 bg-white">
          <Suspense
            fallback={
              <table class="w-full text-sm">
                <tbody>
                  <SkTableRow />
                  <SkTableRow />
                  <SkTableRow />
                  <SkTableRow />
                  <SkTableRow />
                </tbody>
              </table>
            }
          >
            <Show
              when={(data()?.logs ?? []).length > 0}
              fallback={<div class="p-10 text-center text-sm text-slate-500">Tidak ada log ditemukan.</div>}
            >
              <div class="overflow-x-auto">
                <table class="w-full min-w-[860px] text-sm">
                  <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      {th("Waktu", "createdAt")}
                      {th("Aktor", "actor")}
                      {th("Aksi", "action")}
                      {th("Entitas", "entityType")}
                      {th("ID Entitas", "entityId")}
                      {th("IP", "ipAddress")}
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={data()?.logs as ActivityLogRow[] | undefined}>
                      {(log) => (
                        <tr class="hover:bg-slate-50">
                          <td class="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-500">
                            {formatDate(log.createdAt)}
                          </td>
                          <td class="px-5 py-3">
                            <Show when={log.actor} fallback={<span class="italic text-slate-400">Sistem</span>}>
                              {(a) => (
                                <div>
                                  <p class="font-medium text-slate-900">{a().name}</p>
                                  <p class="break-anywhere text-xs text-slate-400">{a().email}</p>
                                </div>
                              )}
                            </Show>
                          </td>
                          <td class="px-5 py-3">
                            <ActionBadge action={log.action} />
                          </td>
                          <td class="px-5 py-3 text-slate-600">{log.entityType}</td>
                          <td class="break-anywhere px-5 py-3 font-mono text-xs text-slate-400">
                            {log.entityId ?? "-"}
                          </td>
                          <td class="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-400">
                            {log.ipAddress ?? "-"}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

              <TablePagination page={page()} pageSize={pageSize()} total={data()?.total ?? 0} onPageChange={setPage} />
            </Show>
          </Suspense>
        </div>
      </div>
      <ExportDataModal
        open={exportOpen()}
        onClose={() => setExportOpen(false)}
        dataset={props.category === "auth" ? "auth-log" : "system-log"}
        title={props.title}
        dateRange="required"
        dateLabel="Tanggal"
        filters={{ action: actionFilter() }}
        filterNote={activeFilterNote()}
      />
    </>
  );
}
