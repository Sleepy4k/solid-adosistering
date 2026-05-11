// Skeleton primitive components

export function SkBox(props: { h?: string; w?: string; class?: string }) {
  return (
    <div
      class={`skeleton ${props.h ?? "h-4"} ${props.w ?? "w-full"} ${props.class ?? ""}`}
    />
  );
}

export function SkCard(props: { lines?: number; class?: string }) {
  const lines = props.lines ?? 3;
  return (
    <div class={`rounded-xl border border-slate-200 bg-white p-5 ${props.class ?? ""}`}>
      <SkBox h="h-5" w="w-2/5" class="mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkBox h="h-3" w={i === lines - 1 ? "w-3/5" : "w-full"} class="mb-2" />
      ))}
    </div>
  );
}

export function SkTableRow() {
  return (
    <tr>
      <td class="py-3 pr-4"><SkBox h="h-3" w="w-8" /></td>
      <td class="py-3 pr-4"><SkBox h="h-3" /></td>
      <td class="py-3 pr-4"><SkBox h="h-3" /></td>
      <td class="py-3 pr-4"><SkBox h="h-3" w="w-24" /></td>
      <td class="py-3"><SkBox h="h-3" w="w-20" /></td>
    </tr>
  );
}

export function SkText(props: { class?: string }) {
  return <SkBox h="h-3" class={props.class} />;
}
