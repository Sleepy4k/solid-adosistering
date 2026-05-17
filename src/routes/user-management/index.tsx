import { cache, createAsync, useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { Plus } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { ModalFrame } from "~/components/shared/ModalFrame";
import resetIcon from "~/assets/icons/reset.svg?url";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import {
  deleteUser,
  getUserFormOptions,
  getUsers,
  setUserActive,
  updateUserById,
  type UserListItem,
} from "~/server/actions/index";
import { SkTableRow } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import type { Role } from "@prisma/client";

type UserFormOptions = Awaited<ReturnType<typeof getUserFormOptions>>;

const loadUsers = cache((role: string, search: string, refreshKey: number) => {
  void refreshKey;
  return getUsers({ role: (role as Role) || undefined, search: search || undefined });
}, "users-list");
const loadFormOptions = cache(() => getUserFormOptions(), "users-form-options");
export const route = { preload: () => Promise.all([loadUsers("", "", 0), loadFormOptions()]) };

function roleBadge(role: Role) {
  const map: Record<Role, { label: string; cls: string }> = {
    SUPERADMIN: { label: "Superadmin", cls: "bg-violet-100 text-violet-700" },
    ADMIN: { label: "Admin", cls: "bg-sky-100 text-sky-700" },
    USER: { label: "User", cls: "bg-slate-100 text-slate-700" },
  };
  const { label, cls } = map[role];
  return <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function regionLabel(regions: UserListItem["regions"]) {
  return regions.length > 0 ? regions.map((region) => region.name).join(", ") : "Belum di-assign";
}

function EditUserModal(props: {
  user: UserListItem;
  options: UserFormOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = createSignal(props.user.name);
  const [email, setEmail] = createSignal(props.user.email);
  const [role, setRole] = createSignal<Role>(props.options.actorRole === "ADMIN" ? "USER" : props.user.role);
  const [whatsapp, setWhatsapp] = createSignal(props.user.whatsapp ?? "");
  const [regionIds, setRegionIds] = createSignal(props.user.regions.map((region) => region.id));
  const [loading, setLoading] = createSignal(false);

  const targetRole = createMemo<Role>(() => (props.options.actorRole === "ADMIN" ? "USER" : role()));
  const selectedRegion = createMemo(() => regionIds()[0] ?? "");

  const setSingleRegion = (regionId: string) => setRegionIds(regionId ? [regionId] : []);
  const toggleRegion = (regionId: string) => {
    setRegionIds((ids) => (ids.includes(regionId) ? ids.filter((id) => id !== regionId) : [...ids, regionId]));
  };

  const validateAssignment = () => {
    if (targetRole() === "USER" && regionIds().length !== 1) return "User wajib di-assign tepat 1 region.";
    if (targetRole() === "ADMIN" && regionIds().length === 0) return "Admin wajib memiliki minimal 1 region.";
    return "";
  };

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    const error = validateAssignment();
    if (error) {
      notify({ kind: "error", title: error });
      return;
    }
    setLoading(true);
    try {
      await updateUserById({
        id: props.user.id,
        name: name(),
        email: email(),
        role: targetRole(),
        whatsapp: whatsapp(),
        regionIds: targetRole() === "SUPERADMIN" ? [] : regionIds(),
      });
      notify({ kind: "success", title: "Data pengguna berhasil diperbarui" });
      props.onSaved();
      props.onClose();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal memperbarui pengguna";
      notify({ kind: "error", title: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto p-5 sm:p-6">
      <>
        <h2 class="mb-5 text-lg font-semibold text-slate-900">Edit Pengguna</h2>
        <form onSubmit={save} class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs font-medium text-slate-600">Nama Lengkap</label>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class="input-field w-full" required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              class="input-field w-full"
              required
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">WhatsApp</label>
            <input value={whatsapp()} onInput={(e) => setWhatsapp(e.currentTarget.value)} class="input-field w-full" />
          </div>

          <Show
            when={props.options.actorRole === "SUPERADMIN"}
            fallback={
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  User
                </div>
              </div>
            }
          >
            <div class="sm:col-span-2">
              <label class="mb-1 block text-xs font-medium text-slate-600">Role</label>
              <select
                value={role()}
                onChange={(e) => setRole(e.currentTarget.value as Role)}
                class="input-field w-full"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPERADMIN">Superadmin</option>
              </select>
            </div>
          </Show>

          <Show when={targetRole() !== "SUPERADMIN"}>
            <div class="sm:col-span-2">
              <label class="mb-2 block text-xs font-medium text-slate-600">
                Region {targetRole() === "USER" ? "(pilih 1)" : "(boleh lebih dari 1)"}
              </label>
              <Show
                when={targetRole() === "ADMIN"}
                fallback={
                  <select
                    value={selectedRegion()}
                    onChange={(e) => setSingleRegion(e.currentTarget.value)}
                    class="input-field w-full"
                    required
                  >
                    <option value="">Pilih region…</option>
                    <For each={props.options.regions}>
                      {(region) => <option value={region.id}>{region.name}</option>}
                    </For>
                  </select>
                }
              >
                <div class="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                  <For each={props.options.regions}>
                    {(region) => (
                      <label class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={regionIds().includes(region.id)}
                          onChange={() => toggleRegion(region.id)}
                          class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {region.name}
                      </label>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          <div class="flex justify-end gap-3 sm:col-span-2">
            <button type="button" class="btn-ghost" onClick={props.onClose}>
              Batal
            </button>
            <button type="submit" disabled={loading()} class="btn-primary">
              {loading() ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}

function normalizedSearchParam(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default function ManajemenUser() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { notify } = useToast();
  const confirm = useConfirm();

  const [roleFilter, setRoleFilter] = createSignal("");
  const [search, setSearch] = createSignal(normalizedSearchParam(params.search));
  const [searchInput, setSearchInput] = createSignal(normalizedSearchParam(params.search));
  const [editTarget, setEditTarget] = createSignal<UserListItem | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(10);

  createEffect(() => {
    const value = normalizedSearchParam(params.search);
    if (value) {
      setSearch(value);
      setSearchInput(value);
    }
  });

  const formOptions = createAsync(() => loadFormOptions());
  const users = createAsync(() => {
    return loadUsers(roleFilter(), search(), refreshKey());
  });
  const userRows = createMemo(() => users() ?? []);
  const pagedUsers = createMemo(() => userRows().slice(page() * pageSize(), (page() + 1) * pageSize()));

  createEffect(() => {
    const lastPage = Math.max(0, Math.ceil(userRows().length / pageSize()) - 1);
    if (page() > lastPage) setPage(lastPage);
  });

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    setSearch(searchInput());
    setPage(0);
  };

  const resetFilters = () => {
    setRoleFilter("");
    setSearch("");
    setSearchInput("");
    setPage(0);
  };

  const handleToggleActive = async (user: UserListItem) => {
    const label = user.isActive ? "nonaktifkan" : "aktifkan";
    const ok = await confirm({
      title: `${user.isActive ? "Nonaktifkan" : "Aktifkan"} Pengguna`,
      message: `Yakin ingin ${label} akun "${user.name}"?`,
      confirmLabel: user.isActive ? "Nonaktifkan" : "Aktifkan",
    });
    if (!ok) return;
    try {
      await setUserActive({ id: user.id, active: !user.isActive });
      notify({ kind: "success", title: `Akun berhasil di${label}kan` });
      setRefreshKey((k) => k + 1);
    } catch {
      notify({ kind: "error", title: `Gagal ${label} akun` });
    }
  };

  const handleDelete = async (user: UserListItem) => {
    const ok = await confirm({
      title: "Hapus Pengguna",
      message: `Tindakan ini akan menghapus akun "${user.name}" secara permanen. Lanjutkan?`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteUser({ id: user.id });
      notify({ kind: "success", title: "Pengguna berhasil dihapus" });
      setRefreshKey((k) => k + 1);
    } catch {
      notify({ kind: "error", title: "Gagal menghapus pengguna" });
    }
  };

  return (
    <>
      <PageMeta page="userManagement" />

      <div class="flex flex-col gap-5">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-bold text-slate-900">Manajemen User</h1>
          <button
            type="button"
            onClick={() => navigate("/user-management/create")}
            class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={16} />
            Tambah User
          </button>
        </div>

        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <form onSubmit={handleSearch} class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Cari</label>
              <input
                type="text"
                placeholder="Nama, email, atau WhatsApp..."
                value={searchInput()}
                onInput={(e) => setSearchInput(e.currentTarget.value)}
                class="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              type="submit"
              class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Cari
            </button>
          </form>

          <Show when={formOptions()?.actorRole === "SUPERADMIN"}>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Role</label>
              <select
                value={roleFilter()}
                onChange={(e) => {
                  setRoleFilter(e.currentTarget.value);
                  setPage(0);
                }}
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Semua Role</option>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPERADMIN">Superadmin</option>
              </select>
            </div>
          </Show>

          <PageSizeSelect
            value={pageSize()}
            onChange={(value) => {
              setPageSize(value);
              setPage(0);
            }}
          />

          <button
            type="button"
            onClick={resetFilters}
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <img src={resetIcon} alt="" class="h-4 w-4" aria-hidden="true" />
            Reset
          </button>
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
                </tbody>
              </table>
            }
          >
            <Show
              when={userRows().length > 0}
              fallback={<div class="p-10 text-center text-sm text-slate-500">Tidak ada pengguna ditemukan.</div>}
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th class="px-5 py-3 text-left">Nama</th>
                      <th class="px-5 py-3 text-left">Email</th>
                      <th class="px-5 py-3 text-left">WhatsApp</th>
                      <th class="px-5 py-3 text-left">Role</th>
                      <th class="px-5 py-3 text-left">Region</th>
                      <th class="px-5 py-3 text-left">Status</th>
                      <th class="px-5 py-3 text-left">Bergabung</th>
                      <th class="px-5 py-3 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={pagedUsers()}>
                      {(user) => (
                        <tr class="hover:bg-slate-50">
                          <td class="px-5 py-3 font-medium text-slate-900">{user.name}</td>
                          <td class="px-5 py-3 text-slate-600">{user.email}</td>
                          <td class="px-5 py-3 text-slate-500">{user.whatsapp ?? "-"}</td>
                          <td class="px-5 py-3">{roleBadge(user.role)}</td>
                          <td class="px-5 py-3 text-slate-600">{regionLabel(user.regions)}</td>
                          <td class="px-5 py-3">
                            <span
                              class={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                            >
                              {user.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          </td>
                          <td class="px-5 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                          <td class="px-5 py-3">
                            <div class="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditTarget(user)}
                                class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(user)}
                                class={`rounded-lg border px-2.5 py-1 text-xs font-medium ${user.isActive ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                              >
                                {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(user)}
                                class="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <TablePagination page={page()} pageSize={pageSize()} total={userRows().length} onPageChange={setPage} />
            </Show>
          </Suspense>
        </div>
      </div>

      <Show when={editTarget() && formOptions()}>
        <EditUserModal
          user={editTarget()!}
          options={formOptions()!}
          onClose={() => setEditTarget(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      </Show>

      <style>{`
        .input-field { border-radius: 0.625rem; border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color 150ms, box-shadow 150ms; }
        .input-field:focus { border-color: #10b981; box-shadow: 0 0 0 3px #10b98133; }
        .btn-primary { background: #059669; color: #fff; font-size: 0.875rem; font-weight: 600; padding: 0.5rem 1.25rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-primary:hover { background: #047857; }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-ghost { border: 1px solid #e2e8f0; color: #374151; font-size: 0.875rem; font-weight: 500; padding: 0.5rem 1rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-ghost:hover { background: #f8fafc; }
      `}</style>
    </>
  );
}
