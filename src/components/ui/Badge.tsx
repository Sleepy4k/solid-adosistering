import type { JSX } from "solid-js";

type BadgeTone = "success" | "warning" | "danger" | "info" | "muted";

const toneClass: Record<BadgeTone, string> = {
  success: "bg-[#D4F4DD] text-[#186D3C]",
  warning: "bg-[#FDF1B9] text-[#947E11]",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  muted: "bg-[#ECECEC] text-[#4F4F4F]",
};

export function Badge(props: { children: JSX.Element; tone?: BadgeTone; class?: string }) {
  return (
    <span
      class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${toneClass[props.tone ?? "muted"]} ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  );
}
