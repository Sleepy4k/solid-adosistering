import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

type ButtonTone = "primary" | "danger" | "neutral" | "outline";

const toneClass: Record<ButtonTone, string> = {
  primary: "btn-3d-green text-white",
  danger: "btn-3d-red text-white",
  neutral: "rounded-xl bg-[#2F3336] text-white hover:bg-[#24282B]",
  outline: "rounded-xl border border-[#C2C2C2] bg-white text-[#4F4F4F] hover:bg-gray-50",
};

export function Button(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  const [local, rest] = splitProps(props, ["tone", "class", "children"]);
  return (
    <button
      {...rest}
      class={`inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        toneClass[local.tone ?? "primary"]
      } ${local.class ?? ""}`}
    >
      {local.children}
    </button>
  );
}
