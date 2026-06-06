import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";

type Option = { value: string; label: string };

export function SimpleSelect(props: {
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let containerRef!: HTMLDivElement;

  const selected = () => props.options.find((o) => o.value === props.value);

  createEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.contains(e.target as Node)) setOpen(false);
    };
    if (open()) document.addEventListener("click", handler);
    else document.removeEventListener("click", handler);
    onCleanup(() => document.removeEventListener("click", handler));
  });

  const choose = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open()}
      >
        <span class={selected()?.value !== undefined && selected()?.value !== "" ? "text-slate-700" : "text-slate-400"}>
          {selected()?.label ?? props.placeholder ?? "Pilih"}
        </span>
        <ChevronDown
          size={14}
          class={`shrink-0 text-slate-400 transition-transform duration-150 ${open() ? "rotate-180" : ""}`}
        />
      </button>

      <Show when={open()}>
        <div
          class="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md"
          role="listbox"
        >
          <For each={props.options}>
            {(opt) => (
              <button
                type="button"
                role="option"
                aria-selected={props.value === opt.value}
                class={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                  props.value === opt.value ? "font-medium text-emerald-700" : "text-slate-700"
                }`}
                onClick={() => choose(opt.value)}
              >
                <span class="flex-1">{opt.label}</span>
                <Show when={props.value === opt.value && opt.value !== ""}>
                  <Check size={13} class="shrink-0 text-emerald-600" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
