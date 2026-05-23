import { createMemo, For, Show } from "solid-js";
import { SelectSearch } from "./SelectSearch";

export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

type PageSizeSelectProps = {
  value: number;
  onChange: (pageSize: number) => void;
};

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 0), Math.max(totalPages - 1, 0));
}

function numberedPages(currentPage: number, totalPages: number) {
  if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index);

  const pages = new Set<number>([0, 1, 2, totalPages - 3, totalPages - 2, totalPages - 1]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 0 && page < totalPages) pages.add(page);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1];
    return index > 0 && page - previous > 1 ? (["ellipsis", page] as const) : [page];
  });
}

export function PageSizeSelect(props: PageSizeSelectProps) {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-slate-600">Tampilkan</label>
      <SelectSearch
        value={String(props.value)}
        options={TABLE_PAGE_SIZE_OPTIONS.map((option) => ({ value: String(option), label: `${option} data` }))}
        onChange={(value) => props.onChange(Number(value))}
      />
    </div>
  );
}

export function TablePagination(props: TablePaginationProps) {
  const totalPages = createMemo(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
  const page = createMemo(() => clampPage(props.page, totalPages()));
  const pages = createMemo(() => numberedPages(page(), totalPages()));
  const start = createMemo(() => (props.total === 0 ? 0 : page() * props.pageSize + 1));
  const end = createMemo(() => Math.min(props.total, (page() + 1) * props.pageSize));

  const buttonClass =
    "min-w-9 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div class="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-slate-500">
        Menampilkan {start()}-{end()} dari {props.total} data
      </p>

      <Show when={props.total > 0}>
        <nav class="flex flex-wrap items-center justify-end gap-1" aria-label="Pagination">
          <button
            type="button"
            disabled={page() === 0}
            onClick={() => props.onPageChange(page() - 1)}
            class={buttonClass}
          >
            Prev
          </button>
          <For each={pages()}>
            {(item) => (
              <Show when={item !== "ellipsis"} fallback={<span class="px-2 py-1.5 text-sm text-slate-400">...</span>}>
                <button
                  type="button"
                  onClick={() => props.onPageChange(item as number)}
                  class={`min-w-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    item === page()
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {(item as number) + 1}
                </button>
              </Show>
            )}
          </For>
          <button
            type="button"
            disabled={page() >= totalPages() - 1}
            onClick={() => props.onPageChange(page() + 1)}
            class={buttonClass}
          >
            Next
          </button>
        </nav>
      </Show>
    </div>
  );
}
