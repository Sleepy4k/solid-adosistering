import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-solid";

const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1]! - 1, parts[2]);
}

function toValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(value: string): string {
  const d = parseDate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function DatePicker(props: { value: string; placeholder?: string; onChange: (value: string) => void }) {
  const today = new Date();
  const [open, setOpen] = createSignal(false);
  const [viewYear, setViewYear] = createSignal(today.getFullYear());
  const [viewMonth, setViewMonth] = createSignal(today.getMonth());
  const [showYearPicker, setShowYearPicker] = createSignal(false);

  const [yearCenter, setYearCenter] = createSignal(today.getFullYear());
  let containerRef!: HTMLDivElement;

  const years = createMemo(() => Array.from({ length: 12 }, (_, i) => yearCenter() - 5 + i));

  createEffect(
    on(
      () => props.value,
      (val) => {
        const d = parseDate(val);
        if (d) {
          setViewYear(d.getFullYear());
          setViewMonth(d.getMonth());
        }
      },
      { defer: true },
    ),
  );

  const cells = createMemo(() => {
    const y = viewYear();
    const m = viewMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return [...Array<null>(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  });

  const goMonth = (delta: number) => {
    let m = viewMonth() + delta;
    let y = viewYear();
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const select = (day: number) => {
    props.onChange(toValue(new Date(viewYear(), viewMonth(), day)));
    setOpen(false);
  };

  const selectToday = () => {
    props.onChange(toValue(new Date(today.getFullYear(), today.getMonth(), today.getDate())));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setOpen(false);
  };

  const clear = (e: MouseEvent) => {
    e.stopPropagation();
    props.onChange("");
  };

  const openYearPicker = () => {
    setYearCenter(viewYear());
    setShowYearPicker(true);
  };

  const selectYear = (y: number) => {
    setViewYear(y);
    setShowYearPicker(false);
  };

  const isSelected = (day: number) => {
    const sel = parseDate(props.value);
    return !!sel && sel.getFullYear() === viewYear() && sel.getMonth() === viewMonth() && sel.getDate() === day;
  };

  const isToday = (day: number) =>
    today.getFullYear() === viewYear() && today.getMonth() === viewMonth() && today.getDate() === day;

  createEffect(() => {
    const handler = (e: MouseEvent) => {

      if (!e.composedPath().includes(containerRef as EventTarget)) {
        setOpen(false);
        setShowYearPicker(false);
      }
    };
    if (open()) document.addEventListener("click", handler);
    else document.removeEventListener("click", handler);
    onCleanup(() => document.removeEventListener("click", handler));
  });

  return (
    <div ref={containerRef} class="relative">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        onClick={() => {
          setShowYearPicker(false);
          setOpen((v) => !v);
        }}
      >
        <span class={props.value ? "text-slate-800" : "text-slate-400"}>
          {props.value ? formatDisplay(props.value) : (props.placeholder ?? "Pilih tanggal")}
        </span>
        <div class="flex shrink-0 items-center gap-1 text-slate-400">
          <Show when={props.value}>
            <span
              role="button"
              tabindex="0"
              class="rounded p-0.5 hover:text-slate-600"
              onClick={clear}
              aria-label="Hapus tanggal"
            >
              <X size={14} />
            </span>
          </Show>
          <Calendar size={15} />
        </div>
      </button>

      <Show when={open()}>
        <div class="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div class="mb-3 flex items-center justify-between">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => (showYearPicker() ? setYearCenter((c) => c - 12) : goMonth(-1))}
              aria-label="Sebelumnya"
            >
              <ChevronLeft size={15} />
            </button>

            <Show
              when={!showYearPicker()}
              fallback={
                <span class="text-sm font-semibold text-slate-800">
                  {years()[0]} – {years()[11]}
                </span>
              }
            >
              <div class="flex items-center gap-1 text-sm font-semibold text-slate-800">
                <span>{MONTHS[viewMonth()]}</span>
                <button
                  type="button"
                  class="rounded px-1 py-0.5 text-emerald-600 underline decoration-dotted hover:bg-emerald-50"
                  onClick={openYearPicker}
                  title="Ganti tahun"
                >
                  {viewYear()}
                </button>
              </div>
            </Show>

            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => (showYearPicker() ? setYearCenter((c) => c + 12) : goMonth(1))}
              aria-label="Berikutnya"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <Show when={showYearPicker()}>
            <div class="grid grid-cols-3 gap-1">
              <For each={years()}>
                {(y) => (
                  <button
                    type="button"
                    onClick={() => selectYear(y)}
                    class={`rounded-lg py-2 text-sm font-medium transition-colors ${
                      y === viewYear()
                        ? "bg-emerald-600 text-white"
                        : y === today.getFullYear()
                          ? "text-emerald-600 ring-1 ring-inset ring-emerald-400 hover:bg-emerald-50"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {y}
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              class="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
              onClick={() => setShowYearPicker(false)}
            >
              ← Kembali ke Kalender
            </button>
          </Show>

          <Show when={!showYearPicker()}>
            <div class="mb-1 grid grid-cols-7 text-center">
              <For each={DAYS_SHORT}>
                {(d) => <span class="py-1 text-[10px] font-semibold uppercase text-slate-400">{d}</span>}
              </For>
            </div>

            <div class="grid grid-cols-7">
              <For each={cells()}>
                {(day) => (
                  <Show when={day !== null} fallback={<span />}>
                    <button
                      type="button"
                      onClick={() => select(day!)}
                      class={`m-0.5 flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors ${
                        isSelected(day!)
                          ? "bg-emerald-600 font-semibold text-white"
                          : isToday(day!)
                            ? "font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-400"
                            : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {day}
                    </button>
                  </Show>
                )}
              </For>
            </div>

            <div class="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={selectToday}
                class="w-full rounded-lg py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
              >
                Hari Ini
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
