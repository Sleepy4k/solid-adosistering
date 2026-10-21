import { For } from "solid-js";

export function DualRange(props: {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onMin: (value: number) => void;
  onMax: (value: number) => void;
}) {
  const THUMB = 20;
  const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
  const range = () => props.max - props.min;
  const minPct = () => ((clamp(props.minValue) - props.min) / range()) * 100;
  const maxPct = () => ((clamp(props.maxValue) - props.min) / range()) * 100;
  const unit = () => props.unit ?? "%";

  const pos = (pct: number) => `calc(${pct}% + ${(0.5 - pct / 100) * THUMB}px)`;
  const bubblePos = (pct: number) => `clamp(1.5rem, ${pct}%, calc(100% - 1.5rem))`;

  const ticks = () => {
    if (props.max <= 10) {
      return Array.from({ length: props.max - props.min + 1 }, (_, i) => props.min + i);
    }
    const values = [];
    for (let v = props.min; v <= props.max; v += 25) values.push(v);
    if (values[values.length - 1] !== props.max) values.push(props.max);
    return values;
  };

  return (
    <div class="relative pb-2 pt-2 sm:pt-8">
      <div
        class="mb-3 flex items-center justify-between text-xs font-semibold text-primary-dark sm:hidden"
        aria-hidden="true"
      >
        <span>
          {clamp(props.minValue)}
          {unit()}
        </span>
        <span>
          {clamp(props.maxValue)}
          {unit()}
        </span>
      </div>

      <div class="hidden sm:block" aria-hidden="true">
        <div
          class="absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-primary-dark px-2 py-1 text-xs font-semibold text-white"
          style={{ left: bubblePos(minPct()) }}
        >
          {clamp(props.minValue)}
          {unit()}
        </div>
        <div
          class="absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-primary-dark px-2 py-1 text-xs font-semibold text-white"
          style={{ left: bubblePos(maxPct()) }}
        >
          {clamp(props.maxValue)}
          {unit()}
        </div>
      </div>

      <div class="relative h-2">
        <div class="absolute h-2 w-full rounded-full bg-[#E5E5E5]" />
        <div
          class="absolute h-2 rounded-full bg-primary"
          style={{
            left: pos(minPct()),
            right: `calc(${100 - maxPct()}% + ${(maxPct() / 100 - 0.5) * THUMB}px)`,
          }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.minValue)}
          disabled={props.disabled}
          aria-label="Nilai minimum"
          onInput={(e) => props.onMin(Number(e.currentTarget.value))}
          class="dual-range-slider dual-range-min absolute h-2 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.maxValue)}
          disabled={props.disabled}
          aria-label="Nilai maksimum"
          onInput={(e) => props.onMax(Number(e.currentTarget.value))}
          class="dual-range-slider dual-range-max absolute h-2 w-full appearance-none bg-transparent"
        />
      </div>

      <div class="relative mt-4 h-5" aria-hidden="true">
        <For each={ticks()}>
          {(tick, i) => {
            const pct = ((tick - props.min) / range()) * 100;
            const tickCount = ticks().length;
            const edge = i() === 0 || i() === tickCount - 1;
            return (
              <span
                class={`absolute top-0 whitespace-nowrap text-[11px] text-gray-500 ${
                  i() === 0 ? "" : i() === tickCount - 1 ? "-translate-x-full" : "-translate-x-1/2"
                } ${edge ? "" : "hidden sm:block"}`}
                style={{ left: pos(pct) }}
              >
                {tick}
                {unit()}
              </span>
            );
          }}
        </For>
      </div>
    </div>
  );
}
