import { Show } from "solid-js";

export function Toggle(props: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  const small = () => props.size === "sm";
  return (
    <label class="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        class={`relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          small() ? "h-6 w-11" : "h-7 w-12"
        } ${props.checked ? "bg-[#67B744]" : "bg-gray-300"}`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span
          class={`inline-block rounded-full bg-white shadow-md transition-transform ${
            small() ? "h-4 w-4" : "h-5 w-5"
          } ${props.checked ? (small() ? "translate-x-6" : "translate-x-6") : "translate-x-1"}`}
        />
      </button>
      <Show when={props.label}>
        <span class="text-sm font-medium text-[#4F4F4F]">{props.label}</span>
      </Show>
    </label>
  );
}
