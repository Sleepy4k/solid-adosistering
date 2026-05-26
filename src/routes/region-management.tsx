import { query, createAsync } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, lazy, Show, Suspense } from "solid-js";
import { Plus } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { getRegions, deleteRegion, getAdmins } from "~/server/actions/index";
import { SkTableRow } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";

type RegionRow = Awaited<ReturnType<typeof getRegions>>[number];

const RegionModal = lazy(() =>
  import("~/features/region-management/RegionModal").then((m) => ({ default: m.RegionModal })),
);
const AdminAssignModal = lazy(() =>
  import("~/features/region-management/AdminAssignModal").then((m) => ({ default: m.AdminAssignModal })),
);

const SYNC_BADGES: Record<string, { label: string; cls: string }> = {
  SYNCED: { label: "Tersinkron", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  FAILED: { label: "Gagal", cls: "bg-rose-100 text-rose-700" },
};

const loadRegions = query(() => getRegions(), "regions-list");
const loadAdmins = query(() => getAdmins(), "admins-list");
export const route = { preload: () => Promise.all([loadRegions(), loadAdmins()]) };

export default function ManajemenRegion() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [editTarget, setEditTarget] = createSignal<RegionRow | null>(null);
  const [showCreate, setShowCreate] = createSignal<boolean>(false);
  const [adminTarget, setAdminTarget] = createSignal<RegionRow | null>(null);
  const [refreshKey, setRefreshKey] = createSignal<number>(0);
  const [loadError, setLoadError] = createSignal<string>("");
  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(10);

  const regions = createAsync(async () => {
    void refreshKey();
    setLoadError("");
    try {
      return await loadRegions();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Data region belum bisa dimuat.");
      return [];
    }
  });
  const regionRows = createMemo(() => regions() ?? []);
  const pagedRegions = createMemo(() => regionRows().slice(page() * pageSize(), (page() + 1) * pageSize()));

  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(regionRows().length / pageSize()) - 1);
    if (page() > lastPage) setPage(lastPage);
  });

  const handleDelete = async (r: RegionRow) => {
    const ok = await confirm({
      title: "Hapus Region",
      message: `Menghapus "${r.name}" akan menghapus semua blok, sprayer, dan data terkait secara permanen. Lanjutkan?`,
      confirmLabel: "Hapus Permanen",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRegion({ id: r.id });
      notify({ kind: "success", title: `Region "${r.name}" dihapus` });
      setRefreshKey((k) => k + 1);
    } catch {
      notify({ kind: "error", title: "Gagal menghapus region" });
    }
  };

  return (
    <>
      <PageMeta page="regionManagement" />

      <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 class="text-2xl font-bold text-slate-900">Manajemen Region</h1>
          <div class="flex flex-wrap items-end gap-3">
            <PageSizeSelect
              value={pageSize()}
              onChange={(value) => {
                setPageSize(value);
                setPage(0);
              }}
            />
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={16} />
              Tambah Region
            </button>
          </div>
        </div>

        <Show when={loadError()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Data region belum bisa dimuat. {loadError()}
          </div>
        </Show>

        <div class="animate-in-soft rounded-xl border border-slate-200 bg-white">
          <Suspense
            fallback={
              <table class="w-full text-sm">
                <tbody>
                  <SkTableRow />
                  <SkTableRow />
                  <SkTableRow />
                </tbody>
              </table>
            }
          >
            <Show
              when={regionRows().length > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">Belum ada region. Buat region pertama Anda.</div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th class="px-5 py-3 text-left">Nama Region</th>
                      <th class="px-5 py-3 text-left">Blok</th>
                      <th class="px-5 py-3 text-left">Admin</th>
                      <th class="px-5 py-3 text-left">Firebase</th>
                      <th class="px-5 py-3 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={pagedRegions()}>
                      {(region) => {
                        const badge = SYNC_BADGES[region.firebaseSyncStatus] ?? SYNC_BADGES.PENDING;
                        return (
                          <tr class="hover:bg-slate-50">
                            <td class="px-5 py-3">
                              <p class="font-medium text-slate-900">{region.name}</p>
                              <p class="text-xs text-slate-400">{region.description ?? "—"}</p>
                            </td>
                            <td class="px-5 py-3 text-slate-600">{region._count.blocks}</td>
                            <td class="px-5 py-3">
                              <Show
                                when={region.adminAssignments.length > 0}
                                fallback={<span class="italic text-xs text-slate-400">Belum ada</span>}
                              >
                                <div class="flex flex-col gap-0.5">
                                  <For each={region.adminAssignments}>
                                    {(a) => <span class="text-xs text-slate-700">{a.admin.name}</span>}
                                  </For>
                                </div>
                              </Show>
                            </td>
                            <td class="px-5 py-3">
                              <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td class="px-5 py-3">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditTarget(region)}
                                  class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminTarget(region)}
                                  class="rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                                >
                                  Admin
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(region)}
                                  class="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
              <TablePagination page={page()} pageSize={pageSize()} total={regionRows().length} onPageChange={setPage} />
            </Show>
          </Suspense>
        </div>
      </div>

      <Show when={showCreate()}>
        <RegionModal onClose={() => setShowCreate(false)} onSaved={() => setRefreshKey((k) => k + 1)} />
      </Show>
      <Show when={editTarget()}>
        {(r) => (
          <RegionModal initial={r()} onClose={() => setEditTarget(null)} onSaved={() => setRefreshKey((k) => k + 1)} />
        )}
      </Show>
      <Show when={adminTarget()}>
        {(r) => (
          <AdminAssignModal
            region={r()}
            onClose={() => setAdminTarget(null)}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </Show>
    </>
  );
}
