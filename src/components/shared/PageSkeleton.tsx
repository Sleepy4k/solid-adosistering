import { For } from "solid-js";

export function PageSkeleton() {
  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-[#C2C2C2] bg-white p-6">
        <div class="skeleton h-7 w-44" />
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <For each={[0, 1, 2]}>
          {() => (
            <div class="rounded-2xl border border-[#C2C2C2] bg-white p-5">
              <div class="skeleton mb-4 h-4 w-24" />
              <div class="skeleton h-8 w-32" />
            </div>
          )}
        </For>
      </div>
      <div class="rounded-2xl border border-[#C2C2C2] bg-white p-5">
        <div class="skeleton mb-4 h-5 w-52" />
        <div class="skeleton h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
