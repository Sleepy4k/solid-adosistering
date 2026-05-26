import { createMemo, createSignal, For, Show } from "solid-js";
import type { Role } from "@prisma/client";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { useToast } from "~/components/shared/ToastProvider";
import type { getUserFormOptions } from "~/server/actions/index";
import { updateUserById } from "~/server/actions/index";
import type { UserListItem } from "~/types/users";

type UserFormOptions = Awaited<ReturnType<typeof getUserFormOptions>>;

const inputCls =
  "rounded-[0.625rem] border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
const btnPrimary =
  "rounded-[0.625rem] bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60";
const btnGhost =
  "rounded-[0.625rem] border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

export function EditUserModal(props: {
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
            <input
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              class={`${inputCls} w-full`}
              required
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              class={`${inputCls} w-full`}
              required
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">WhatsApp</label>
            <input
              value={whatsapp()}
              onInput={(e) => setWhatsapp(e.currentTarget.value)}
              class={`${inputCls} w-full`}
            />
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
              <SelectSearch
                value={role()}
                options={[
                  { value: "USER", label: "User" },
                  { value: "ADMIN", label: "Admin" },
                  { value: "SUPERADMIN", label: "Superadmin" },
                ]}
                onChange={(value) => setRole(value as Role)}
              />
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
                  <SelectSearch
                    value={selectedRegion()}
                    placeholder="Pilih region..."
                    options={[
                      { value: "", label: "Pilih region..." },
                      ...props.options.regions.map((region) => ({ value: region.id, label: region.name })),
                    ]}
                    onChange={setSingleRegion}
                  />
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
            <button type="button" class={btnGhost} onClick={props.onClose}>
              Batal
            </button>
            <button type="submit" disabled={loading()} class={btnPrimary}>
              {loading() ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}
