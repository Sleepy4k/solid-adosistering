import { cache, createAsync } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { Plus } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import {
  getRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  getAdmins,
  assignAdminToRegion,
  removeAdminFromRegion,
} from "~/server/actions/index";
import { SkTableRow } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { SelectSearch } from "~/components/ui/SelectSearch";

type RegionRow = Awaited<ReturnType<typeof getRegions>>[number];

const loadRegions = cache(() => getRegions(), "regions-list");
const loadAdmins = cache(() => getAdmins(), "admins-list");
export const route = { preload: () => Promise.all([loadRegions(), loadAdmins()]) };

const SYNC_BADGES: Record<string, { label: string; cls: string }> = {
  SYNCED: { label: "Tersinkron", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  FAILED: { label: "Gagal", cls: "bg-rose-100 text-rose-700" },
};

function RegionModal(props: { initial?: RegionRow; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [desc, setDesc] = createSignal(props.initial?.description ?? "");
  const [lat, setLat] = createSignal(props.initial?.latitude?.toString() ?? "");
  const [lng, setLng] = createSignal(props.initial?.longitude?.toString() ?? "");
  const [saving, setSaving] = createSignal(false);

  const inp =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 w-full";

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const latitude = lat().trim() || null;
      const longitude = lng().trim() || null;
      const parsedLatitude = latitude === null ? null : Number(latitude);
      const parsedLongitude = longitude === null ? null : Number(longitude);
      if (
        (parsedLatitude !== null && !Number.isFinite(parsedLatitude)) ||
        (parsedLongitude !== null && !Number.isFinite(parsedLongitude))
      ) {
        throw new Response("Koordinat region tidak valid.", { status: 400 });
      }
      if (props.initial) {
        await updateRegion({
          id: props.initial.id,
          name: name(),
          description: desc() || undefined,
          latitude,
          longitude,
        });
      } else {
        await createRegion({ name: name(), description: desc() || undefined, latitude, longitude });
      }
      notify({ kind: "success", title: `Region "${name()}" berhasil ${props.initial ? "diperbarui" : "dibuat"}` });
      props.onSaved();
      props.onClose();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan region";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto p-6">
      <>
        <h2 class="mb-5 text-lg font-semibold text-slate-900">{props.initial ? "Edit Region" : "Tambah Region"}</h2>
        <form onSubmit={save} class="flex flex-col gap-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">
              Nama Region <span class="text-rose-500">*</span>
            </label>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class={inp} required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Deskripsi</label>
            <input value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} class={inp} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600">Latitude</label>
              <input
                type="number"
                step="0.0000000000000001"
                value={lat()}
                onInput={(e) => setLat(e.currentTarget.value)}
                class={inp}
                placeholder="-7.6116625887708010"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-600">Longitude</label>
              <input
                type="number"
                step="0.0000000000000001"
                value={lng()}
                onInput={(e) => setLng(e.currentTarget.value)}
                class={inp}
                placeholder="109.1770180391451000"
              />
            </div>
          </div>
          <p class="text-xs text-amber-600">Menyimpan region akan otomatis melakukan sinkronisasi ke Firebase RTDB.</p>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving()}
              class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving() ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}

function AdminAssignModal(props: { region: RegionRow; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const admins = createAsync(() => loadAdmins());
  const [selectedAdmin, setSelectedAdmin] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const assignedIds = new Set(props.region.adminAssignments.map((a) => a.admin.id));

  const assign = async () => {
    if (!selectedAdmin()) return;
    setSaving(true);
    try {
      await assignAdminToRegion({ adminId: selectedAdmin(), regionId: props.region.id });
      notify({ kind: "success", title: "Admin berhasil ditugaskan" });
      props.onSaved();
      props.onClose();
    } catch {
      notify({ kind: "error", title: "Gagal menugaskan admin" });
    } finally {
      setSaving(false);
    }
  };

  const unassign = async (adminId: string) => {
    try {
      await removeAdminFromRegion({ adminId, regionId: props.region.id });
      notify({ kind: "success", title: "Admin berhasil dilepas" });
      props.onSaved();
      props.onClose();
    } catch {
      notify({ kind: "error", title: "Gagal melepas admin" });
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto p-6">
      <>
        <h2 class="mb-4 text-lg font-semibold text-slate-900">Kelola Admin — {props.region.name}</h2>

        {/* Current admins */}
        <div class="mb-4">
          <p class="mb-2 text-xs font-medium text-slate-600">Admin Saat Ini</p>
          <Show
            when={props.region.adminAssignments.length > 0}
            fallback={<p class="text-sm text-slate-400 italic">Belum ada admin ditugaskan</p>}
          >
            <ul class="flex flex-col gap-2">
              <For each={props.region.adminAssignments}>
                {(a) => (
                  <li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p class="text-sm font-medium text-slate-900">{a.admin.name}</p>
                      <p class="text-xs text-slate-400">{a.admin.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => unassign(a.admin.id)}
                      class="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Lepas
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        {/* Assign new admin */}
        <div class="flex gap-2">
          <Suspense>
            <SelectSearch
              class="flex-1"
              value={selectedAdmin()}
              placeholder="Pilih admin baru..."
              options={[
                { value: "", label: "Pilih admin baru..." },
                ...(admins() ?? [])
                  .filter((a) => !assignedIds.has(a.id))
                  .map((a) => ({ value: a.id, label: `${a.name} (${a.email})` })),
              ]}
              onChange={setSelectedAdmin}
            />
          </Suspense>
          <button
            type="button"
            disabled={!selectedAdmin() || saving()}
            onClick={assign}
            class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving() ? "…" : "Tugaskan"}
          </button>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
        </div>
      </>
    </ModalFrame>
  );
}

export default function ManajemenRegion() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [editTarget, setEditTarget] = createSignal<RegionRow | null>(null);
  const [showCreate, setShowCreate] = createSignal(false);
  const [adminTarget, setAdminTarget] = createSignal<RegionRow | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [loadError, setLoadError] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(10);

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
                                fallback={<span class="text-slate-400 italic text-xs">Belum ada</span>}
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

      {/* Modals */}
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
