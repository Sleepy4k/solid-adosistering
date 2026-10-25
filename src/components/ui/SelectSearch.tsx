import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { ChevronDown, Search, X } from "lucide-solid";
import { Popover } from "~/components/ui/Popover";

export type SelectOption = { value: string; label: string };

/**
 * Static mode (`options`) filters locally and is only meant for tiny fixed lists.
 * Async mode (`loadOptions`) never filters in the browser: every query goes to the server.
 */
export function SelectSearch(props: {
  options?: SelectOption[];
  /** Server-side search. Called with the trimmed query (empty string when the panel opens). */
  loadOptions?: (query: string) => Promise<SelectOption[]>;
  /** Label of the currently selected value, shown when it is not in the loaded results. */
  selectedLabel?: string;
  value: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  class?: string;
  align?: "start" | "end";
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = createSignal<boolean>(false);
  const [query, setQuery] = createSignal<string>("");
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const [remote, setRemote] = createSignal<SelectOption[]>([]);
  const [loading, setLoading] = createSignal<boolean>(false);
  const [failed, setFailed] = createSignal<boolean>(false);
  const [pickedOption, setPickedOption] = createSignal<SelectOption | null>(null);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const isAsync = () => props.loadOptions !== undefined;
  const staticOptions = () => props.options ?? [];

  const selected = (): SelectOption | undefined => {
    if (!props.value) return undefined;
    const found = isAsync()
      ? remote().find((o) => o.value === props.value)
      : staticOptions().find((o) => o.value === props.value);
    if (found) return found;
    const picked = pickedOption();
    if (picked && picked.value === props.value) return picked;
    if (props.selectedLabel) return { value: props.value, label: props.selectedLabel };
    return staticOptions().find((o) => o.value === props.value);
  };
  const filtered = () => {
    if (isAsync()) return remote();
    const q = query().toLowerCase().trim();
    if (!q) return staticOptions();
    return staticOptions().filter((o) => o.label.toLowerCase().includes(q));
  };

  const fetchRemote = async (q: string) => {
    const load = props.loadOptions;
    if (!load) return;
    const mySeq = ++seq;
    setLoading(true);
    setFailed(false);
    try {
      const result = await load(q);
      if (mySeq !== seq) return;
      setRemote(result);
    } catch {
      if (mySeq !== seq) return;
      setRemote([]);
      setFailed(true);
    } finally {
      if (mySeq === seq) setLoading(false);
    }
  };

  const onQueryInput = (value: string) => {
    setQuery(value);
    if (!isAsync()) return;
    clearTimeout(timer);
    setLoading(true);
    timer = setTimeout(() => void fetchRemote(value.trim()), 250);
  };

  onCleanup(() => {
    clearTimeout(timer);
    seq++;
  });

  const pick = (opt: SelectOption) => {
    setOpen(false);
    setPickedOption(opt.value ? opt : null);
    props.onChange(opt.value);
    setQuery("");
  };

  const clear = (e: MouseEvent) => {
    e.stopPropagation();
    setPickedOption(null);
    props.onChange("");
    setQuery("");
  };

  createEffect(
    on(open, (isOpen) => {
      if (isOpen) {
        setTimeout(() => inputRef?.focus(), 10);
        // A reopened panel starts from an empty query, matching its unfiltered results.
        setQuery("");
        if (isAsync()) {
          clearTimeout(timer);
          void fetchRemote("");
        }
      } else {
        clearTimeout(timer);
        seq++;
        setLoading(false);
      }
    }),
  );

  return (
    <div ref={containerRef} class={`relative min-w-0 ${props.class ?? ""}`}>
      <div class="flex w-full min-w-0 items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-700 transition-colors focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/30">
        <button
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open()}
          class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            class={`min-w-0 flex-1 truncate text-left ${selected() ? "text-slate-800" : "text-slate-400"}`}
            title={selected()?.label}
          >
            {selected()?.label ?? props.placeholder ?? "Pilih..."}
          </span>
          <ChevronDown size={16} class={`shrink-0 text-slate-400 transition-transform ${open() ? "rotate-180" : ""}`} />
        </button>

        <Show when={props.value}>
          <button
            type="button"
            disabled={props.disabled}
            class="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={clear}
            aria-label="Hapus"
          >
            <X size={14} />
          </button>
        </Show>
      </div>

      <Popover
        open={open()}
        anchorRef={() => containerRef}
        onClose={() => setOpen(false)}
        align={props.align}
        width={320}
        maxHeight={320}
        panelClass="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
      >
        <div class="flex items-center gap-2 border-b border-slate-100 px-3 py-2 focus-within:ring-2 focus-within:ring-inset focus-within:ring-emerald-500/40">
          <Search size={14} class="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            class="min-w-0 flex-1 text-sm outline-none placeholder:text-slate-400"
            placeholder={props.searchPlaceholder ?? "Cari..."}
            aria-label={props.searchPlaceholder ?? "Cari"}
            value={query()}
            onInput={(e) => onQueryInput(e.currentTarget.value)}
          />
        </div>
        <ul class="max-h-52 overflow-y-auto py-1">
          <Show when={isAsync() && loading()}>
            <li class="px-4 py-2 text-sm text-slate-400" role="status">
              Memuat...
            </li>
          </Show>
          <Show
            when={filtered().length > 0}
            fallback={
              <Show when={!loading()}>
                <li class="px-4 py-2 text-sm text-slate-400">{failed() ? "Gagal memuat data" : "Tidak ada hasil"}</li>
              </Show>
            }
          >
            <For each={filtered()}>
              {(opt) => (
                <li>
                  <button
                    type="button"
                    title={opt.label}
                    class={`block w-full truncate px-4 py-2 text-left text-sm hover:bg-emerald-50 ${opt.value === props.value ? "font-semibold text-emerald-700" : "text-slate-700"}`}
                    onClick={() => pick(opt)}
                  >
                    {opt.label}
                  </button>
                </li>
              )}
            </For>
          </Show>
        </ul>
      </Popover>
    </div>
  );
}
