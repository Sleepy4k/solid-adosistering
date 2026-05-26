import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { ChevronDown, Search, X } from "lucide-solid";

export type SelectOption = { value: string; label: string };

export function SelectSearch(props: {
  options: SelectOption[];
  value: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  class?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const selected = () => props.options.find((o) => o.value === props.value);
  const filtered = () => {
    const q = query().toLowerCase().trim();
    if (!q) return props.options;
    return props.options.filter((o) => o.label.toLowerCase().includes(q));
  };

  const pick = (value: string) => {
    props.onChange(value);
    setOpen(false);
    setQuery("");
  };

  const clear = (e: MouseEvent) => {
    e.stopPropagation();
    props.onChange("");
    setQuery("");
  };

  createEffect(
    on(open, (isOpen) => {
      if (isOpen) setTimeout(() => inputRef?.focus(), 10);
    }),
  );

  const onDocClick = (e: MouseEvent) => {
    if (!containerRef?.contains(e.target as Node)) setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener("click", onDocClick);
    else document.removeEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return (
    <div ref={containerRef} class={`relative ${props.class ?? ""}`}>
      <button
        type="button"
        disabled={props.disabled}
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span class={selected() ? "text-slate-800" : "text-slate-400"}>
          {selected()?.label ?? props.placeholder ?? "Pilih..."}
        </span>
        <div class="flex items-center gap-1 text-slate-400">
          <Show when={props.value}>
            <span
              role="button"
              tabindex="0"
              class="rounded p-0.5 hover:text-slate-600"
              onClick={clear}
              aria-label="Hapus"
            >
              <X size={14} />
            </span>
          </Show>
          <ChevronDown size={16} class={`transition-transform ${open() ? "rotate-180" : ""}`} />
        </div>
      </button>

      <Show when={open()}>
        <div class="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div class="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} class="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              class="w-full text-sm outline-none placeholder:text-slate-400"
              placeholder={props.searchPlaceholder ?? "Cari..."}
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <ul class="max-h-52 overflow-y-auto py-1">
            <Show
              when={filtered().length > 0}
              fallback={<li class="px-4 py-2 text-sm text-slate-400">Tidak ada hasil</li>}
            >
              <For each={filtered()}>
                {(opt) => (
                  <li>
                    <button
                      type="button"
                      class={`w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 ${opt.value === props.value ? "font-semibold text-emerald-700" : "text-slate-700"}`}
                      onClick={() => pick(opt.value)}
                    >
                      {opt.label}
                    </button>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </div>
      </Show>
    </div>
  );
}
