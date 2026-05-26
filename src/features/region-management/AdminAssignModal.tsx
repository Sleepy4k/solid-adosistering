import { createAsync, query } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { useToast } from "~/components/shared/ToastProvider";
import type { getRegions } from "~/server/actions/index";
import { getAdmins, assignAdminToRegion, removeAdminFromRegion } from "~/server/actions/index";

type RegionRow = Awaited<ReturnType<typeof getRegions>>[number];

const loadAdmins = query(() => getAdmins(), "admins-list");

export function AdminAssignModal(props: { region: RegionRow; onClose: () => void; onSaved: () => void }) {
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

        <div class="mb-4">
          <p class="mb-2 text-xs font-medium text-slate-600">Admin Saat Ini</p>
          <Show
            when={props.region.adminAssignments.length > 0}
            fallback={<p class="italic text-sm text-slate-400">Belum ada admin ditugaskan</p>}
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
