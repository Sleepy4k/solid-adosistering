import { query, createAsync, revalidate } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Pencil, Plus, Trash2 } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageHeader } from "~/components/ui/PageHeader";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { Card, CardHeader } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { ImageUpload } from "~/components/shared/ImageUpload";
import { getAllPartners, createPartner, updatePartner, deletePartner } from "~/server/actions/index";

type Item = Awaited<ReturnType<typeof getAllPartners>>[number];

const ADMIN_KEY = "all-partners";
const PUBLIC_KEY = "landing-partners";
const load = query(() => getAllPartners(), ADMIN_KEY);
export const route = { preload: () => load() };

const inp =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function PartnerModal(props: { initial?: Item; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [name, setName] = createSignal<string>(props.initial?.name ?? "");
  const [logoUrl, setLogoUrl] = createSignal<string>(props.initial?.logoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = createSignal<string>(props.initial?.websiteUrl ?? "");
  const [sortOrder, setSortOrder] = createSignal<number>(props.initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = createSignal<boolean>(props.initial?.isActive ?? true);
  const [saving, setSaving] = createSignal<boolean>(false);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (props.initial) {
        await updatePartner({
          id: props.initial.id,
          name: name(),
          logoUrl: logoUrl() || undefined,
          websiteUrl: websiteUrl() || undefined,
          sortOrder: sortOrder(),
          isActive: isActive(),
        });
      } else {
        await createPartner({
          name: name(),
          logoUrl: logoUrl() || undefined,
          websiteUrl: websiteUrl() || undefined,
          sortOrder: sortOrder(),
        });
      }
      await revalidate(ADMIN_KEY);
      await revalidate(PUBLIC_KEY);
      notify({ kind: "success", title: props.initial ? "Mitra diperbarui." : "Mitra ditambahkan." });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-w-lg p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <h2 class="mb-4 text-lg font-semibold text-slate-900">{props.initial ? "Edit Mitra" : "Tambah Mitra"}</h2>
      <form onSubmit={save} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-slate-600">
            Nama Mitra <span class="text-rose-500">*</span>
          </label>
          <input
            class={inp}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Nama institusi / perusahaan"
            required
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-slate-600">Logo</label>
          <ImageUpload
            value={logoUrl()}
            onChange={setLogoUrl}
            placeholder="/uploads/cms/logo.png atau https://..."
            previewContainerClass="mt-1 flex h-20 w-40 items-center justify-center rounded-lg border border-slate-200 bg-neutral-100 p-3 relative"
            previewImgClass="max-h-full max-w-full object-contain"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-slate-600">URL Website</label>
          <input
            class={inp}
            value={websiteUrl()}
            onInput={(e) => setWebsiteUrl(e.currentTarget.value)}
            placeholder="https://mitra.ac.id (opsional)"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Urutan Tampil</label>
            <input
              type="number"
              class={inp}
              value={sortOrder()}
              onInput={(e) => setSortOrder(Number(e.currentTarget.value))}
            />
          </div>
          <Show when={props.initial}>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600">Status</label>
              <button
                type="button"
                onClick={() => setIsActive((v: boolean) => !v)}
                class={`rounded-lg border px-3 py-2 text-sm font-medium ${isActive() ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              >
                {isActive() ? "Aktif" : "Nonaktif"}
              </button>
            </div>
          </Show>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={props.onClose}
          >
            Batal
          </button>
          <button
            type="submit"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={saving()}
          >
            {saving() ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export default function CmsPartners() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const items = createAsync(() => load());
  const [adding, setAdding] = createSignal<boolean>(false);
  const [editing, setEditing] = createSignal<Item | null>(null);

  const handleDelete = async (item: Item) => {
    const ok = await confirm({
      title: "Hapus Mitra",
      message: `Hapus mitra "${item.name}"?`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePartner(item.id);
      await revalidate(ADMIN_KEY);
      await revalidate(PUBLIC_KEY);
      notify({ kind: "success", title: "Mitra dihapus." });
    } catch {
      notify({ kind: "error", title: "Gagal menghapus." });
    }
  };

  return (
    <>
      <PageMeta page="cmsPartners" />
      <div class="space-y-5">
        <PageHeader
          title="CMS Mitra"
          description={<p class="mt-0.5 text-sm text-slate-500">Kelola logo mitra yang tampil di landing page.</p>}
          actions={
            <Button tone="primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Tambah Mitra
            </Button>
          }
        />
        <Card>
          <CardHeader title={`Daftar Mitra (${(items() ?? []).length})`} />
          <Suspense fallback={<div class="p-8 text-center text-sm text-slate-500">Memuat...</div>}>
            <Show
              when={(items() ?? []).length > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">
                  Belum ada mitra. Klik "Tambah Mitra" untuk menambahkan.
                </div>
              }
            >
              <div class="divide-y divide-slate-100">
                <For each={items()}>
                  {(item) => (
                    <div class="flex items-center gap-4 px-5 py-4">
                      <div class="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-neutral-100 p-2">
                        <Show when={item.logoUrl} fallback={<span class="text-xs text-slate-400">No logo</span>}>
                          <img
                            src={item.logoUrl!}
                            alt={item.name}
                            class="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-semibold text-slate-900">{item.name}</span>
                          <Badge tone={item.isActive ? "success" : "muted"}>
                            {item.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                          <span class="text-xs text-slate-400">Urutan: {item.sortOrder}</span>
                        </div>
                        <Show when={item.websiteUrl}>
                          <a
                            href={item.websiteUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="mt-0.5 text-xs text-emerald-600 hover:underline"
                          >
                            {item.websiteUrl}
                          </a>
                        </Show>
                      </div>
                      <div class="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          title="Edit"
                          class="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                          onClick={() => setEditing(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Hapus"
                          class="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Suspense>
        </Card>
      </div>

      <Show when={adding()}>
        <PartnerModal onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />
      </Show>
      <Show when={editing()}>
        <PartnerModal initial={editing()!} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
      </Show>
    </>
  );
}
