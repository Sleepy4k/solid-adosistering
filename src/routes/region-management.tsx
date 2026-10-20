import { query, createAsync, revalidate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, lazy, Show, Suspense } from "solid-js";
import { Plus } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { Badge } from "~/components/ui/Badge";
import { getRegions, deleteRegion, getAdmins } from "~/server/actions/regions";
import { setRegionAutomaticMode } from "~/server/actions/settings";
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
  const [modePendingId, setModePendingId] = createSignal<string | null>(null);

  const regions = createAsync(async () => {
    void refreshKey();
    setLoadError("");
    try {
      return await loadRegions();
    } catch (error) {
      setLoadError(!import.meta.env.PROD && error instanceof Error ? error.message : "Data region belum bisa dimuat.");
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

  const handleAutomaticMode = async (r: RegionRow, enabled: boolean) => {
    if (enabled && r.sprayerCount === 0) {
      notify({
        kind: "warning",
        title: "Mode otomatis membutuhkan sprayer aktif",
        message: "Aktifkan atau tambahkan minimal satu sprayer pada region ini terlebih dahulu.",
      });
      return;
    }

    const ok = await confirm({
      title: enabled ? "Aktifkan Mode Otomatis" : "Nonaktifkan Mode Otomatis",
      message: enabled
        ? `Mengaktifkan mode otomatis untuk region "${r.name}" akan memindahkan semua sprayer aktif ke AUTO/OFF. Irigasi dapat menyala secara otomatis berdasarkan kelembapan tanah. Lanjutkan?`
        : `Menonaktifkan mode otomatis untuk region "${r.name}" akan memindahkan semua sprayer aktif ke MANUAL/OFF. Lanjutkan?`,
      confirmLabel: enabled ? "Aktifkan Otomatis" : "Nonaktifkan",
      tone: enabled ? "primary" : "danger",
    });
    if (!ok) return;

    setModePendingId(r.id);
    try {
      const result = await setRegionAutomaticMode({ regionId: r.id, enabled });
      if (result.syncStatus === "FAILED") {
        notify({
          kind: "warning",
          title: "Mode otomatis tersimpan, sinkronisasi Firebase tertunda",
          message:
            "Status utama di database sudah diperbarui, tetapi mirror Firebase gagal atau belum tersinkron. Perangkat dapat memakai mode sebelumnya sampai sinkronisasi berhasil.",
        });
      } else {
        notify({
          kind: "success",
          title: enabled ? `Mode otomatis diaktifkan untuk ${r.name}` : `Mode otomatis dinonaktifkan untuk ${r.name}`,
          message:
            result.sprayerCount > 0
              ? `${result.sprayerCount} sprayer aktif dipindahkan ke ${enabled ? "AUTO/OFF" : "MANUAL/OFF"}.`
              : "Tidak ada sprayer aktif yang perlu dipindahkan.",
        });
      }
    } catch (error) {
      const message =
        error instanceof Response
          ? (await error.text().catch(() => "")) || "Periksa koneksi Anda lalu coba lagi."
          : "Periksa koneksi Anda lalu coba lagi.";
      notify({ kind: "error", title: "Gagal mengubah mode otomatis", message });
      return;
    } finally {
      setModePendingId(null);
    }

    await revalidate("regions-list").catch(() => undefined);
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
                      <th class="px-5 py-3 text-left">Mode Otomatis</th>
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
                              <div class="flex flex-col gap-2">
                                <div class="flex items-center gap-2">
                                  <Badge tone={region.automaticMode ? "success" : "muted"}>
                                    {region.automaticMode ? "Aktif" : "Nonaktif"}
                                  </Badge>
                                  <span class="text-xs text-slate-400">{region.sprayerCount} sprayer aktif</span>
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    modePendingId() !== null || (!region.automaticMode && region.sprayerCount === 0)
                                  }
                                  title={
                                    !region.automaticMode && region.sprayerCount === 0
                                      ? "Aktifkan minimal satu sprayer di region ini untuk memakai mode otomatis."
                                      : undefined
                                  }
                                  onClick={() => handleAutomaticMode(region, !region.automaticMode)}
                                  class={`w-fit rounded-lg border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                                    region.automaticMode
                                      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  }`}
                                >
                                  {modePendingId() === region.id
                                    ? "Menyimpan..."
                                    : region.automaticMode
                                      ? "Nonaktifkan"
                                      : "Aktifkan"}
                                </button>
                              </div>
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
