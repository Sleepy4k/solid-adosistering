import { createMemo, For, Show } from "solid-js";

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
    <label class="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-600">
      <span>Tampilkan</span>
      <select
        class="min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        <For each={TABLE_PAGE_SIZE_OPTIONS}>
          {(option) => (
            <option value={option} selected={option === props.value}>
              {option} data
            </option>
          )}
        </For>
      </select>
    </label>
  );
}

export function TablePagination(props: TablePaginationProps) {
  const totalPages = createMemo(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
  const page = createMemo(() => clampPage(props.page, totalPages()));
  const pages = createMemo(() => numberedPages(page(), totalPages()));
  const start = createMemo(() => (props.total === 0 ? 0 : page() * props.pageSize + 1));
  const end = createMemo(() => Math.min(props.total, (page() + 1) * props.pageSize));

  const buttonClass =
    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div class="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-slate-500">
        Menampilkan {start()}-{end()} dari {props.total} data
      </p>

      <Show when={props.total > 0}>
        <nav class="flex items-center justify-between gap-2 sm:justify-end sm:gap-1" aria-label="Pagination">
          <button
            type="button"
            disabled={page() === 0}
            onClick={() => props.onPageChange(page() - 1)}
            class={buttonClass}
          >
            Prev
          </button>

          <span class="text-sm tabular-nums text-slate-500 sm:hidden">
            Halaman {page() + 1} / {totalPages()}
          </span>

          <div class="hidden items-center gap-1 sm:flex">
            <For each={pages()}>
              {(item) => (
                <Show
                  when={item !== "ellipsis"}
                  fallback={
                    <span
                      class="inline-flex h-10 w-8 items-center justify-center text-sm text-slate-400"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  }
                >
                  <button
                    type="button"
                    onClick={() => props.onPageChange(item as number)}
                    aria-current={item === page() ? "page" : undefined}
                    class={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
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
          </div>

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
