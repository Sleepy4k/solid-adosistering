import type { JSX } from "solid-js";

export function Card(props: { children: JSX.Element; class?: string }) {
  return <div class={`rounded-2xl border border-[#C2C2C2] bg-white ${props.class ?? ""}`}>{props.children}</div>;
}

export function CardHeader(props: { title: JSX.Element; actions?: JSX.Element; class?: string }) {
  return (
    <div
      class={`flex flex-wrap items-center justify-between gap-3 border-b border-[#D4D4D4] px-5 py-4 ${props.class ?? ""}`}
    >
      <h2 class="text-lg font-bold text-[#4F4F4F]">{props.title}</h2>
      {props.actions}
    </div>
  );
}
