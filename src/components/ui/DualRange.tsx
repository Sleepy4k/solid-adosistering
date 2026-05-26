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
  const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
  const range = () => props.max - props.min;
  const minPct = () => ((clamp(props.minValue) - props.min) / range()) * 100;
  const maxPct = () => ((clamp(props.maxValue) - props.min) / range()) * 100;
  const unit = () => props.unit ?? "%";
  const ticks = () => {
    if (props.max <= 10) {
      return Array.from({ length: props.max - props.min + 1 }, (_, index) => props.min + index);
    }
    const values = [];
    for (let value = props.min; value <= props.max; value += 25) values.push(value);
    if (values[values.length - 1] !== props.max) values.push(props.max);
    return values;
  };

  return (
    <div class="relative pb-2 pt-8">
      <div
        class="absolute top-0 z-10 -translate-x-1/2 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
        style={{ left: `${minPct()}%` }}
      >
        {clamp(props.minValue)}
        {unit()}
      </div>
      <div
        class="absolute top-0 z-10 -translate-x-1/2 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
        style={{ left: `${maxPct()}%` }}
      >
        {clamp(props.maxValue)}
        {unit()}
      </div>

      <div class="relative h-2">
        <div class="absolute h-2 w-full rounded-full bg-[#E5E5E5]" />
        <div
          class="absolute h-2 rounded-full bg-primary"
          style={{ left: `${minPct()}%`, width: `${maxPct() - minPct()}%` }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.minValue)}
          disabled={props.disabled}
          onInput={(event) => props.onMin(Number(event.currentTarget.value))}
          class="dual-range-slider dual-range-min absolute h-2 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={clamp(props.maxValue)}
          disabled={props.disabled}
          onInput={(event) => props.onMax(Number(event.currentTarget.value))}
          class="dual-range-slider dual-range-max absolute h-2 w-full appearance-none bg-transparent"
        />
      </div>

      <div
        class="mt-4 grid px-1 text-[11px] text-gray-400"
        style={{ "grid-template-columns": `repeat(${ticks().length}, minmax(0, 1fr))` }}
      >
        <For each={ticks()}>
          {(tick, index) => (
            <span
              class={`${index() === 0 ? "text-left" : index() === ticks().length - 1 ? "text-right" : "text-center"}`}
            >
              {tick}
              {unit()}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}
