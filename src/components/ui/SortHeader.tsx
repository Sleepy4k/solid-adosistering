import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-solid";
import { type JSX, Show } from "solid-js";
import { nextSort, type TableSort } from "~/lib/shared/tableSort";

/**
 * Clickable column header for server-side sorting. It only reports the new
 * `{ key, dir }`; the page owns the state and refetches from the server.
 * Use it inside a header cell (`<th>` or a header `<div>`), and add
 * `aria-sort` on the cell via `ariaSort()`.
 */
export function SortHeader<K extends string>(props: {
  label: JSX.Element;
  column: K;
  sort: TableSort<K> | null;
  onSort: (next: TableSort<K>) => void;
  class?: string;
}) {
  const active = () => props.sort?.key === props.column;
  return (
    <button
      type="button"
      onClick={() => props.onSort(nextSort(props.sort, props.column))}
      class={`inline-flex items-center gap-1.5 text-left font-semibold transition hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
        active() ? "text-emerald-700" : ""
      } ${props.class ?? ""}`}
    >
      {props.label}
      <Show when={active()} fallback={<ArrowUpDown size={14} class="opacity-40" aria-hidden="true" />}>
        <Show when={props.sort?.dir === "asc"} fallback={<ArrowDown size={14} aria-hidden="true" />}>
          <ArrowUp size={14} aria-hidden="true" />
        </Show>
      </Show>
    </button>
  );
}

export function ariaSort<K extends string>(sort: TableSort<K> | null, column: K) {
  if (sort?.key !== column) return "none" as const;
  return sort.dir === "asc" ? ("ascending" as const) : ("descending" as const);
}
