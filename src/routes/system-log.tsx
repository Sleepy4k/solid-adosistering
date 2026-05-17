import { cache, createAsync } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import resetIcon from "~/assets/icons/reset.svg?url";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { getActivityLogs, type ActivityLogItem } from "~/server/actions/index";
import { SkTableRow } from "~/components/shared/Skeleton";
import type { ActivityAction } from "@prisma/client";

const ACTION_LABELS: Partial<Record<ActivityAction, string>> = {
  AUTH_LOGIN: "Login",
  AUTH_LOGOUT: "Logout",
  AUTH_PASSWORD_RESET_REQUEST: "Reset PW (Request)",
  AUTH_PASSWORD_RESET_COMPLETE: "Reset PW (Selesai)",
  CREATE: "Buat",
  UPDATE: "Perbarui",
  DELETE: "Hapus",
  ASSIGN: "Tugaskan",
  UNASSIGN: "Lepas Tugas",
  CONTROL_OVERRIDE: "Kontrol Manual",
  FIREBASE_SYNC: "Sync Firebase",
};

const ACTION_COLORS: Partial<Record<ActivityAction, string>> = {
  AUTH_LOGIN: "bg-sky-100 text-sky-700",
  AUTH_LOGOUT: "bg-slate-100 text-slate-600",
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
  ASSIGN: "bg-violet-100 text-violet-700",
  UNASSIGN: "bg-orange-100 text-orange-700",
  CONTROL_OVERRIDE: "bg-blue-100 text-blue-700",
};

const loadLogs = cache(
  (action: string, pageSize: number, offset: number) =>
    getActivityLogs({ action: action || undefined, limit: pageSize, offset }),
  "activity-logs",
);
export const route = { preload: () => loadLogs("", 10, 0) };

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

function ActionBadge(props: { action: ActivityAction }) {
  const label = ACTION_LABELS[props.action] ?? props.action;
  const color = ACTION_COLORS[props.action] ?? "bg-slate-100 text-slate-600";
  return <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>;
}

export default function LogSistem() {
  const [actionFilter, setActionFilter] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(10);

  const data = createAsync(() => loadLogs(actionFilter(), pageSize(), page() * pageSize()));

  const reset = () => {
    setActionFilter("");
    setPage(0);
  };

  return (
    <>
      <PageMeta page="systemLog" />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Log Sistem</h1>

        {/* Filters */}
        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Tipe Aksi</label>
            <select
              value={actionFilter()}
              onChange={(e) => {
                setActionFilter(e.currentTarget.value);
                setPage(0);
              }}
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Semua Aksi</option>
              {(Object.entries(ACTION_LABELS) as [ActivityAction, string][]).map(([v, l]) => (
                <option value={v}>{l}</option>
              ))}
            </select>
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
            <img src={resetIcon} alt="" class="h-4 w-4" aria-hidden="true" />
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

        {/* Table */}
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
                          <td class="px-5 py-3 text-slate-500 font-mono text-xs">{formatDate(log.createdAt)}</td>
                          <td class="px-5 py-3">
                            <Show when={log.actor} fallback={<span class="text-slate-400 italic">Sistem</span>}>
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
                          <td class="px-5 py-3 font-mono text-xs text-slate-400">{log.entityId ?? "—"}</td>
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
    </>
  );
}
