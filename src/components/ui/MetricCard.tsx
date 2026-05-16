import type { JSX } from "solid-js";
import { Card } from "./Card";

export function MetricCard(props: { label: string; value: JSX.Element; icon?: JSX.Element; class?: string }) {
  return (
    <Card class={`flex items-center gap-4 px-5 py-4 ${props.class ?? ""}`}>
      <div class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#E8E8E8] text-[#6B6B6B]">
        {props.icon}
      </div>
      <div class="min-w-0">
        <p class="truncate text-2xl font-bold text-[#333]">{props.value}</p>
        <p class="text-sm text-[#6B6B6B]">{props.label}</p>
      </div>
    </Card>
  );
}
