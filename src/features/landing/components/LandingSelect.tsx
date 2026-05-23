import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

export type LandingSelectOption = { value: string; label: string };

type LandingSelectProps = {
  id?: string;
  value: string;
  options: LandingSelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
};

export default function LandingSelect(props: LandingSelectProps) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const selected = () => props.options.find((option) => option.value === props.value);

  const pick = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  const onDocClick = (event: MouseEvent) => {
    if (!containerRef?.contains(event.target as Node)) setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener("click", onDocClick);
    else document.removeEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        id={props.id}
        class={`flex h-[49px] w-full items-center justify-between gap-2 rounded-[12px] border bg-white px-4 text-[0.9375rem] transition ${
          open()
            ? "border-2 border-[#54A610] text-[#111827]"
            : "border-[#C2C2C2] text-[#9CA3AF]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        <span class={selected() ? "text-[#111827]" : "text-[#9CA3AF]"}>
          {selected()?.label ?? props.placeholder ?? "Pilih"}
        </span>
        <svg
          class={`h-4 w-4 text-[#4F4F4F] transition-transform ${open() ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={open()}>
        <ul
          class="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-[12px] border border-[#C2C2C2] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
          role="listbox"
        >
          <For each={props.options}>
            {(option) => (
              <li>
                <button
                  type="button"
                  class={`w-full px-4 py-2 text-left text-[0.9375rem] transition hover:bg-[#f9fafb] ${
                    option.value === props.value ? "font-medium text-[#54A610]" : "text-[#4F4F4F]"
                  }`}
                  role="option"
                  aria-selected={option.value === props.value}
                  onClick={() => pick(option.value)}
                >
                  {option.label}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
