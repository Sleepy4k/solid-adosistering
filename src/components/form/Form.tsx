import type { JSX } from "solid-js";
import { Show } from "solid-js";

export function Field(props: { label: string; for?: string; error?: string; children: JSX.Element }) {
  return (
    <div class="flex w-full flex-col gap-2">
      <label for={props.for} class="form-label">
        {props.label}
      </label>
      {props.children}
      <Show when={props.error}>
        <span class="form-error">{props.error}</span>
      </Show>
    </div>
  );
}

export function TextInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} class={`form-input ${props.class ?? ""}`} />;
}
