import type { JSX } from "solid-js";
import { Card } from "./Card";

export function PageHeader(props: { title: string; actions?: JSX.Element; description?: JSX.Element }) {
  return (
    <Card class="px-5 py-4 sm:px-6">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl font-bold text-[#4F4F4F] sm:text-2xl">{props.title}</h1>
          {props.description}
        </div>
        {props.actions}
      </div>
    </Card>
  );
}
