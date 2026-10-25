import { Search } from "lucide-solid";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { PageSizeSelect } from "~/components/ui/TablePagination";
import type { TableSort } from "~/lib/shared/tableSort";
import { ListSortBar } from "./ListSortBar";
import type { useServerList } from "./useServerList";

export type ActiveFilter = "all" | "active" | "inactive";

const ACTIVE_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

/** Search, active filter, page size and sort controls shared by the CMS admin lists. */
export function CmsListToolbar<K extends string>(props: {
  list: ReturnType<typeof useServerList<K>>;
  active: ActiveFilter;
  onActiveChange: (value: ActiveFilter) => void;
  columns: { key: K; label: string }[];
  searchLabel: string;
}) {
  return (
    <>
      <div class="flex flex-wrap items-end gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
        <label class="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-medium text-slate-600">
          <span>Cari</span>
          <span class="relative">
            <Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={props.list.searchInput()}
              onInput={(e) => props.list.onSearchInput(e.currentTarget.value)}
              placeholder={props.searchLabel}
              maxLength={100}
              class="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </span>
        </label>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-600">Status</span>
          <SimpleSelect
            value={props.active}
            options={ACTIVE_OPTIONS}
            onChange={(value) => props.list.resetPageWith(() => props.onActiveChange(value as ActiveFilter))}
          />
        </div>
        <PageSizeSelect value={props.list.pageSize()} onChange={props.list.setPageSize} />
      </div>
      <ListSortBar columns={props.columns} sort={props.list.sort() as TableSort<K>} onSort={props.list.setSort} />
    </>
  );
}
