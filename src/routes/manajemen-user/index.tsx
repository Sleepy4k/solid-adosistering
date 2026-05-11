import { cache, createAsync, useNavigate } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { getUsers, setUserActive, deleteUser, type UserListItem } from "~/server/actions";
import { SkTableRow } from "~/components/Sk";
import { useToast } from "~/components/ToastProvider";
import { useConfirm } from "~/components/ConfirmProvider";
import type { Role } from "@prisma/client";

const loadUsers = cache(
  (role: string, search: string) =>
    getUsers({ role: (role as Role) || undefined, search: search || undefined }),
  "users-list",
);
export const route = { preload: () => loadUsers("", "") };

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

function EditUserModal(props: { user: UserListItem; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [name, setName] = createSignal(props.user.name);
  const [email, setEmail] = createSignal(props.user.email);
  const [role, setRole] = createSignal<Role>(props.user.role);
  const [whatsapp, setWhatsapp] = createSignal(props.user.whatsapp ?? "");
  const [loading, setLoading] = createSignal(false);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { updateUserById } = await import("~/server/actions");
      await updateUserById({ id: props.user.id, name: name(), email: email(), role: role(), whatsapp: whatsapp() });
      notify({ kind: "success", title: "Data pengguna berhasil diperbarui" });
      props.onSaved();
      props.onClose();
    } catch {
      notify({ kind: "error", title: "Gagal memperbarui pengguna" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" style={{ animation: "modal-in 200ms ease" }}>
        <h2 class="mb-5 text-lg font-semibold text-slate-900">Edit Pengguna</h2>
        <form onSubmit={save} class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs font-medium text-slate-600">Nama Lengkap</label>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class="input-field w-full" required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} class="input-field w-full" required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">WhatsApp</label>
            <input value={whatsapp()} onInput={(e) => setWhatsapp(e.currentTarget.value)} class="input-field w-full" />
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs font-medium text-slate-600">Role</label>
            <select value={role()} onChange={(e) => setRole(e.currentTarget.value as Role)} class="input-field w-full">
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </div>
          <div class="flex justify-end gap-3 sm:col-span-2">
            <button type="button" class="btn-ghost" onClick={props.onClose}>Batal</button>
            <button type="submit" disabled={loading()} class="btn-primary">{loading() ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManajemenUser() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const confirm = useConfirm();

  const [roleFilter, setRoleFilter] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [searchInput, setSearchInput] = createSignal("");
  const [editTarget, setEditTarget] = createSignal<UserListItem | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);

  const users = createAsync(() => {
    void refreshKey();
    return loadUsers(roleFilter(), search());
  });

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    setSearch(searchInput());
  };

  const resetFilters = () => {
    setRoleFilter("");
    setSearch("");
    setSearchInput("");
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
      <Title>Manajemen User | Adosistering</Title>
      <Meta name="description" content="Kelola daftar pengguna, peran, dan status akun." />

      <div class="flex flex-col gap-5">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-slate-900">Manajemen User</h1>
          <button
            type="button"
            onClick={() => navigate("/manajemen-user/tambah")}
            class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M12 4v16m8-8H4" />
            </svg>
            Tambah User
          </button>
        </div>

        {/* Filters */}
        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <form onSubmit={handleSearch} class="flex items-end gap-2">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Cari</label>
              <input
                type="text"
                placeholder="Nama, email, atau WhatsApp…"
                value={searchInput()}
                onInput={(e) => setSearchInput(e.currentTarget.value)}
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-56"
              />
            </div>
            <button type="submit" class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Cari
            </button>
          </form>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Role</label>
            <select
              value={roleFilter()}
              onChange={(e) => setRoleFilter(e.currentTarget.value)}
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Semua Role</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>

        {/* Table */}
        <div class="rounded-xl border border-slate-200 bg-white">
          <Suspense
            fallback={
              <table class="w-full text-sm">
                <tbody><SkTableRow /><SkTableRow /><SkTableRow /><SkTableRow /></tbody>
              </table>
            }
          >
            <Show
              when={(users() ?? []).length > 0}
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
                      <th class="px-5 py-3 text-left">Status</th>
                      <th class="px-5 py-3 text-left">Bergabung</th>
                      <th class="px-5 py-3 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={users()}>
                      {(user) => (
                        <tr class="hover:bg-slate-50">
                          <td class="px-5 py-3 font-medium text-slate-900">{user.name}</td>
                          <td class="px-5 py-3 text-slate-600">{user.email}</td>
                          <td class="px-5 py-3 text-slate-500">{user.whatsapp ?? "—"}</td>
                          <td class="px-5 py-3">{roleBadge(user.role)}</td>
                          <td class="px-5 py-3">
                            <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
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
            </Show>
          </Suspense>
        </div>
      </div>

      <Show when={editTarget()}>
        {(u) => (
          <EditUserModal
            user={u()}
            onClose={() => setEditTarget(null)}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </Show>

      <style>{`
        .input-field { border-radius: 0.625rem; border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color 150ms, box-shadow 150ms; }
        .input-field:focus { border-color: #10b981; box-shadow: 0 0 0 3px #10b98133; }
        .btn-primary { background: #059669; color: #fff; font-size: 0.875rem; font-weight: 600; padding: 0.5rem 1.25rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-primary:hover { background: #047857; }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-ghost { border: 1px solid #e2e8f0; color: #374151; font-size: 0.875rem; font-weight: 500; padding: 0.5rem 1rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-ghost:hover { background: #f8fafc; }
        @keyframes modal-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </>
  );
}
