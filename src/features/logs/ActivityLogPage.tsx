import { cache, createAsync } from "@solidjs/router";
import type { ActivityAction } from "@prisma/client";
import { createSignal, For, Show, Suspense } from "solid-js";
import { RotateCcw } from "lucide-solid";
import { SkTableRow } from "~/components/shared/Skeleton";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import ActionBadge from "~/features/logs/ActionBadge";
import { getActivityLogs, type ActivityLogItem } from "~/server/actions/index";
import { ACTION_LABELS, AUTH_ACTIONS } from "~/constants/activity-log";

const loadLogs = cache(
  (category: "auth" | "system", action: string, pageSize: number, offset: number) =>
    getActivityLogs({ category, action: action || undefined, limit: pageSize, offset }),
  "activity-logs",
);

export function preloadActivityLogs(category: "auth" | "system") {
  return loadLogs(category, "", 10, 0);
}

function formatDate(d: Date) {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityLogView(props: { category: "auth" | "system"; title: string }) {
  const [actionFilter, setActionFilter] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(10);
  const data = createAsync(() => loadLogs(props.category, actionFilter(), pageSize(), page() * pageSize()));
  const actionOptions = () => {
    const entries = Object.entries(ACTION_LABELS) as [ActivityAction, string][];
    const filtered =
      props.category === "auth"
        ? entries.filter(([value]) => AUTH_ACTIONS.includes(value))
        : entries.filter(([value]) => !AUTH_ACTIONS.includes(value));
    return [{ value: "", label: "Semua Aksi" }, ...filtered.map(([value, label]) => ({ value, label }))];
  };

  const reset = () => {
    setActionFilter("");
    setPage(0);
  };

  return (
    <div class="flex flex-col gap-5">
      <h1 class="text-2xl font-bold text-slate-900">{props.title}</h1>

      <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div class="flex min-w-56 flex-col gap-1.5">
          <label class="text-xs font-medium text-slate-600">Tipe Aksi</label>
          <SelectSearch
            value={actionFilter()}
            placeholder="Semua Aksi"
            options={actionOptions()}
            onChange={(value) => {
              setActionFilter(value);
              setPage(0);
            }}
          />
        </div>
        <PageSizeSelect
          value={pageSize()}
          onChange={(value) => {
            setPageSize(value);
            setPage(0);
          }}
        />
        <button
          type="button"
          onClick={reset}
          class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={16} />
          Reset
        </button>
        <Suspense>
          <Show when={data()}>
            {(d) => (
              <span class="ml-auto text-sm text-slate-500">
                Total: <strong>{d().total}</strong> entri
              </span>
            )}
          </Show>
        </Suspense>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white">
        <Suspense
          fallback={
            <table class="w-full text-sm">
              <tbody>
                <SkTableRow />
                <SkTableRow />
                <SkTableRow />
                <SkTableRow />
                <SkTableRow />
              </tbody>
            </table>
          }
        >
          <Show
            when={(data()?.logs ?? []).length > 0}
            fallback={<div class="p-10 text-center text-sm text-slate-500">Tidak ada log ditemukan.</div>}
          >
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th class="px-5 py-3 text-left">Waktu</th>
                    <th class="px-5 py-3 text-left">Aktor</th>
                    <th class="px-5 py-3 text-left">Aksi</th>
                    <th class="px-5 py-3 text-left">Entitas</th>
                    <th class="px-5 py-3 text-left">ID Entitas</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <For each={data()?.logs}>
                    {(log: ActivityLogItem) => (
                      <tr class="hover:bg-slate-50">
                        <td class="px-5 py-3 font-mono text-xs text-slate-500">{formatDate(log.createdAt)}</td>
                        <td class="px-5 py-3">
                          <Show when={log.actor} fallback={<span class="italic text-slate-400">Sistem</span>}>
                            {(a) => (
                              <div>
                                <p class="font-medium text-slate-900">{a().name}</p>
                                <p class="text-xs text-slate-400">{a().email}</p>
                              </div>
                            )}
                          </Show>
                        </td>
                        <td class="px-5 py-3">
                          <ActionBadge action={log.action} />
                        </td>
                        <td class="px-5 py-3 text-slate-600">{log.entityType}</td>
                        <td class="px-5 py-3 font-mono text-xs text-slate-400">{log.entityId ?? "-"}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <TablePagination page={page()} pageSize={pageSize()} total={data()?.total ?? 0} onPageChange={setPage} />
          </Show>
        </Suspense>
      </div>
    </div>
  );
}
