import { batch, createSignal, onCleanup } from "solid-js";
import type { TableSort } from "~/lib/shared/tableSort";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Query state for a server-side list: the browser only keeps the current
 * search/filter/sort/page state and refetches when it changes. Text search is
 * debounced (`search()` is what the fetcher should use; `searchInput()` is the
 * raw input value) and every change resets the page to 0.
 */
export function useServerList<K extends string>(options: { defaultSort: TableSort<K>; pageSize?: number }) {
  const [searchInput, setSearchInput] = createSignal<string>("");
  const [search, setSearch] = createSignal<string>("");
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSizeSignal] = createSignal<number>(options.pageSize ?? 25);
  const [sort, setSortSignal] = createSignal<TableSort<K>>(options.defaultSort);

  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const onSearchInput = (value: string) => {
    setSearchInput(value);
    clearTimeout(timer);
    timer = setTimeout(() => {
      batch(() => {
        setSearch(value.trim());
        setPage(0);
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const setPageSize = (value: number) =>
    batch(() => {
      setPageSizeSignal(value);
      setPage(0);
    });

  const setSort = (value: TableSort<K>) =>
    batch(() => {
      setSortSignal(value);
      setPage(0);
    });

  /** Run a filter change and reset to the first page in one batch. */
  const resetPageWith = (change: () => void) =>
    batch(() => {
      change();
      setPage(0);
    });

  return {
    searchInput,
    search,
    onSearchInput,
    page,
    setPage,
    pageSize,
    setPageSize,
    sort,
    setSort,
    resetPageWith,
  };
}
