import { For } from "solid-js";
import { SortHeader } from "~/components/ui/SortHeader";
import type { TableSort } from "~/lib/shared/tableSort";

/** Sort controls for card-style lists (no `<th>`): one SortHeader per sortable column. */
export function ListSortBar<K extends string>(props: {
  columns: { key: K; label: string }[];
  sort: TableSort<K>;
  onSort: (next: TableSort<K>) => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-[#6B6B6B] sm:px-5">
      <span class="font-medium">Urutkan:</span>
      <For each={props.columns}>
        {(column) => <SortHeader label={column.label} column={column.key} sort={props.sort} onSort={props.onSort} />}
      </For>
    </div>
  );
}
