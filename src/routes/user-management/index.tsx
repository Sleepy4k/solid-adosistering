import { query, createAsync, useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, lazy, Show, Suspense } from "solid-js";
import { Plus, RotateCcw } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { deleteUser, getUserFormOptions, getUsers, setUserActive } from "~/server/actions/index";
import { SkTableRow } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { roleBadge, formatDate, regionLabel } from "~/features/user-management/utils";
import type { Role } from "@prisma/client";
import type { UserListItem } from "~/types/users";

type UserFormOptions = Awaited<ReturnType<typeof getUserFormOptions>>;

const EditUserModal = lazy(() =>
  import("~/features/user-management/EditUserModal").then((m) => ({ default: m.EditUserModal })),
);

const loadUsers = query((role: string, search: string, refreshKey: number) => {
  void refreshKey;
  return getUsers({ role: (role as Role) || undefined, search: search || undefined });
}, "users-list");
const loadFormOptions = query(() => getUserFormOptions(), "users-form-options");
export const route = { preload: () => Promise.all([loadUsers("", "", 0), loadFormOptions()]) };

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
  const users = createAsync(() => loadUsers(roleFilter(), search(), refreshKey()));
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
              <SelectSearch
                value={roleFilter()}
                placeholder="Semua Role"
                options={[
                  { value: "", label: "Semua Role" },
                  { value: "USER", label: "User" },
                  { value: "ADMIN", label: "Admin" },
                  { value: "SUPERADMIN", label: "Superadmin" },
                ]}
                onChange={(value) => {
                  setRoleFilter(value);
                  setPage(0);
                }}
              />
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
            <RotateCcw size={16} aria-hidden="true" />
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
          options={formOptions()! as UserFormOptions}
          onClose={() => setEditTarget(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      </Show>
    </>
  );
}
