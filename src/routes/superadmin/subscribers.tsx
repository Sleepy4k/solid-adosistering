import { query, createAsync, revalidate } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Mail, Send, Trash2 } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageHeader } from "~/components/ui/PageHeader";
import { Card, CardHeader } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { getAllSubscribers, deleteSubscriber, sendBulkEmail } from "~/server/actions/index";
import { newsletterPreviewHtml } from "~/templates/email/newsletter";
import { useWebConfig } from "~/lib/shared/webConfig";

const KEY = "all-subscribers";
const load = query(() => getAllSubscribers(), KEY);
export const route = { preload: () => load() };

const inp =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

type Subscriber = {
  id: string;
  email: string;
  isActive: boolean;
  subscribedAt: Date;
};

export default function CmsSubscribers() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const items = createAsync(() => load());
  const webConfig = useWebConfig();
  const emailBrand = () => {
    const cfg = webConfig();
    return {
      projectName: cfg.projectName,
      tagline: cfg.tagline ?? undefined,
      logoUrl: cfg.logoUrl,
      primaryColor: cfg.primaryColor,
    };
  };

  const [subject, setSubject] = createSignal<string>("");
  const [body, setBody] = createSignal<string>("");
  const [sending, setSending] = createSignal<boolean>(false);
  const [tab, setTab] = createSignal<"tulis" | "preview">("tulis");

  const activeCount = () => (items() ?? []).filter((s: Subscriber) => s.isActive).length;

  const handleDelete = async (item: Subscriber) => {
    const ok = await confirm({
      title: "Hapus Subscriber",
      message: `Hapus "${item.email}" dari daftar subscriber?`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSubscriber(item.id);
      await revalidate(KEY);
      notify({ kind: "success", title: "Subscriber dihapus." });
    } catch {
      notify({ kind: "error", title: "Gagal menghapus." });
    }
  };

  const handleSendBulk = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!subject().trim() || !body().trim()) return;
    setSending(true);
    try {
      const result = await sendBulkEmail({ subject: subject(), body: body() });
      notify({
        kind: "success",
        title: `Email terkirim ke ${result.sent} subscriber${result.failed > 0 ? `, ${result.failed} gagal` : ""}.`,
      });
      setSubject("");
      setBody("");
      setTab("tulis");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal mengirim bulk email.";
      notify({ kind: "error", title: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageMeta page="cmsSubscribers" />
      <div class="space-y-5">
        <PageHeader
          title="Newsletter"
          description={
            <p class="mt-0.5 text-sm text-slate-500">
              Kelola daftar subscriber dan kirim bulk email ke semua subscriber aktif.
            </p>
          }
        />

        <Card>
          <CardHeader title="Kirim Bulk Email" />
          <form onSubmit={handleSendBulk} class="flex flex-col gap-4 px-5 pb-5">
            <div class="flex flex-col gap-1.5 mt-4">
              <label class="text-xs font-medium text-slate-600">
                Subjek <span class="text-rose-500">*</span>
              </label>
              <input
                class={inp}
                value={subject()}
                onInput={(e) => setSubject(e.currentTarget.value)}
                placeholder="Judul email"
                required
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-slate-600">
                  Isi Pesan <span class="text-rose-500">*</span>
                </label>
                <div class="flex rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setTab("tulis")}
                    class={`px-3 py-1 rounded-l-lg transition ${tab() === "tulis" ? "bg-emerald-600 text-white font-semibold" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Tulis
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("preview")}
                    class={`px-3 py-1 rounded-r-lg transition ${tab() === "preview" ? "bg-emerald-600 text-white font-semibold" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Preview
                  </button>
                </div>
              </div>
              <Show when={tab() === "tulis"}>
                <textarea
                  class={`${inp} resize-none`}
                  rows={6}
                  value={body()}
                  onInput={(e) => setBody(e.currentTarget.value)}
                  placeholder="Tulis isi pesan di sini..."
                  required
                />
              </Show>
              <Show when={tab() === "preview"}>
                <Show
                  when={subject().trim() || body().trim()}
                  fallback={
                    <div class="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                      Isi subjek dan pesan untuk melihat preview.
                    </div>
                  }
                >
                  <iframe
                    srcdoc={newsletterPreviewHtml({
                      subject: subject() || "(tanpa subjek)",
                      body: body(),
                      config: emailBrand(),
                    })}
                    class="h-[480px] w-full rounded-lg border border-slate-200"
                    sandbox="allow-same-origin"
                    title="Preview email"
                  />
                </Show>
              </Show>
              <p class="text-xs text-slate-400">
                Pesan akan dikirim dalam format teks biasa dan HTML ke semua <strong>{activeCount()}</strong> subscriber
                aktif.
              </p>
            </div>
            <div class="flex justify-end">
              <button
                type="submit"
                disabled={sending() || activeCount() === 0}
                class="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Send size={14} />
                {sending() ? "Mengirim..." : `Kirim ke ${activeCount()} Subscriber`}
              </button>
            </div>
          </form>
        </Card>

        {/* Subscriber list */}
        <Card>
          <CardHeader title={`Daftar Subscriber (${(items() ?? []).length})`} />
          <Suspense fallback={<div class="p-8 text-center text-sm text-slate-500">Memuat...</div>}>
            <Show
              when={(items() ?? []).length > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">
                  Belum ada subscriber. Email dari landing page akan muncul di sini.
                </div>
              }
            >
              <div class="divide-y divide-slate-100">
                <For each={items()}>
                  {(item) => (
                    <div class="flex items-center gap-4 px-5 py-3.5">
                      <Mail size={16} class="shrink-0 text-slate-400" />
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-medium text-slate-800">{item.email}</span>
                          <Badge tone={item.isActive ? "success" : "muted"}>
                            {item.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <p class="mt-0.5 text-xs text-slate-400">
                          Daftar:{" "}
                          {new Date(item.subscribedAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="Hapus"
                        class="shrink-0 rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Suspense>
        </Card>
      </div>
    </>
  );
}
