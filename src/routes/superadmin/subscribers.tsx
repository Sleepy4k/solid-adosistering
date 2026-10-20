import { query, createAsync, revalidate } from "@solidjs/router";
import { batch, createEffect, createSignal, For, Show, Suspense } from "solid-js";
import { Mail, RefreshCw, Send, Trash2 } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { PageHeader } from "~/components/ui/PageHeader";
import { Card, CardHeader } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { useToast } from "~/components/shared/ToastProvider";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import {
  getAllSubscribers,
  deleteSubscriber,
  sendBulkEmail,
  resendNewsletterConfirmation,
} from "~/server/actions/newsletter";
import { newsletterPreviewHtml } from "~/templates/email/newsletter";
import { useWebConfig } from "~/lib/shared/webConfig";

const KEY = "all-subscribers";
const DEFAULT_PAGE_SIZE = 25;

const inp =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

type SubscriberStatus = "PENDING" | "CONFIRMED" | "UNSUBSCRIBED";

type Subscriber = {
  id: string;
  email: string;
  status: SubscriberStatus;
  subscribedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

type StatusFilter = "ALL" | SubscriberStatus;

type BulkProgress = { sent: number; failed: number };

const load = query(
  (page: number, pageSize: number, status: StatusFilter) =>
    getAllSubscribers({ page, pageSize, status: status === "ALL" ? undefined : status }),
  KEY,
);
export const route = { preload: () => load(0, DEFAULT_PAGE_SIZE, "ALL") };

const STATUS_META: Record<SubscriberStatus, { label: string; tone: "success" | "warning" | "muted" }> = {
  CONFIRMED: { label: "Terkonfirmasi", tone: "success" },
  PENDING: { label: "Menunggu Konfirmasi", tone: "warning" },
  UNSUBSCRIBED: { label: "Berhenti", tone: "muted" },
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "PENDING", label: "Menunggu" },
  { value: "CONFIRMED", label: "Terkonfirmasi" },
  { value: "UNSUBSCRIBED", label: "Berhenti" },
];

const formatDate = (value: Date) =>
  new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function CmsSubscribers() {
  const { notify } = useToast();
  const confirm = useConfirm();
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

  const [page, setPage] = createSignal<number>(0);
  const [pageSize, setPageSize] = createSignal<number>(DEFAULT_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("ALL");
  const [subject, setSubject] = createSignal<string>("");
  const [body, setBody] = createSignal<string>("");
  const [sending, setSending] = createSignal<boolean>(false);
  const [progress, setProgress] = createSignal<BulkProgress | null>(null);
  const [tab, setTab] = createSignal<"tulis" | "preview">("tulis");
  const [resendingId, setResendingId] = createSignal<string | null>(null);

  const data = createAsync(() => load(page(), pageSize(), statusFilter()));
  const subscribers = () => (data()?.items ?? []) as Subscriber[];
  const total = () => data()?.total ?? 0;
  const confirmedCount = () => data()?.counts.CONFIRMED ?? 0;

  // A delete or a revalidation can shrink the result set while the current page
  // is still the last one. Pull the page back into range instead of showing an
  // empty page that the admin cannot navigate away from.
  createEffect(() => {
    const loadedTotal = data()?.total;
    if (loadedTotal === undefined) return;
    const lastPage = Math.max(0, Math.ceil(loadedTotal / pageSize()) - 1);
    if (page() > lastPage) setPage(lastPage);
  });

  const changePageSize = (value: number) => {
    batch(() => {
      setPageSize(value);
      setPage(0);
    });
  };

  const changeStatusFilter = (value: StatusFilter) => {
    batch(() => {
      setStatusFilter(value);
      setPage(0);
    });
  };

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

  const handleResend = async (item: Subscriber) => {
    if (resendingId()) return;
    setResendingId(item.id);
    try {
      await resendNewsletterConfirmation({ id: item.id });
      await revalidate(KEY);
      notify({ kind: "success", title: "Email konfirmasi dikirim ulang." });
    } catch (err) {
      let message = "Gagal mengirim ulang email konfirmasi.";
      if (err instanceof Response) {
        const text = await err.text();
        if (text) message = text;
        else if (err.status === 429) message = "Terlalu banyak permintaan. Coba lagi nanti.";
      }
      notify({ kind: "error", title: message });
    } finally {
      setResendingId(null);
    }
  };

  const handleSendBulk = async (e: SubmitEvent) => {
    e.preventDefault();
    if (sending()) return;
    const payload = { subject: subject().trim(), body: body().trim() };
    if (!payload.subject || !payload.body || confirmedCount() === 0) return;

    setSending(true);
    setProgress({ sent: 0, failed: 0 });
    let sent = 0;
    let failed = 0;

    try {
      // The server hands out one cursor per batch. Send strictly one batch at a
      // time so a retry cannot race an in-flight request.
      let cursor: string | null = null;
      do {
        const result = await sendBulkEmail({ ...payload, cursor });
        sent += result.sent;
        failed += result.failed;
        cursor = result.nextCursor;
        setProgress({ sent, failed });
      } while (cursor);

      if (sent > 0) {
        notify({
          kind: "success",
          title: `Email terkirim ke ${sent} subscriber${failed > 0 ? `, ${failed} gagal` : ""}.`,
        });
      } else {
        notify({ kind: "error", title: `Gagal mengirim email ke ${failed} subscriber.` });
      }
      setSubject("");
      setBody("");
      setTab("tulis");
    } catch (err) {
      const fallback = "Gagal mengirim bulk email.";
      const message = err instanceof Response ? (await err.text()) || fallback : fallback;
      const partial = sent > 0 || failed > 0 ? ` ${sent} terkirim, ${failed} gagal sebelum pengiriman berhenti.` : "";
      // Keep the draft so the admin can decide whether to retry deliberately.
      notify({ kind: "error", title: `${message}${partial}` });
    } finally {
      setSending(false);
      setProgress(null);
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
              Kelola daftar subscriber dan kirim bulk email ke semua subscriber terkonfirmasi.
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
                  <div class="space-y-2">
                    <iframe
                      srcdoc={newsletterPreviewHtml({
                        subject: subject() || "(tanpa subjek)",
                        body: body(),
                        config: emailBrand(),
                        unsubscribeUrl: "/newsletter/unsubscribe?token=PREVIEW",
                      })}
                      class="h-[480px] w-full rounded-lg border border-slate-200"
                      sandbox=""
                      referrerpolicy="no-referrer"
                      title="Preview email"
                    />
                    <p class="text-xs text-slate-400">
                      Tautan berhenti berlangganan pada preview hanya contoh. Tautan sebenarnya dibuat unik untuk setiap
                      penerima.
                    </p>
                  </div>
                </Show>
              </Show>
              <p class="text-xs text-slate-400" aria-live="polite">
                <Show
                  when={sending()}
                  fallback={
                    <>
                      Pesan akan dikirim dalam format teks biasa dan HTML ke semua <strong>{confirmedCount()}</strong>{" "}
                      subscriber terkonfirmasi.
                    </>
                  }
                >
                  Mengirim... {progress()?.sent ?? 0} terkirim
                  {(progress()?.failed ?? 0) > 0 ? `, ${progress()?.failed ?? 0} gagal` : ""}
                </Show>
              </p>
            </div>
            <div class="flex justify-end">
              <button
                type="submit"
                disabled={sending() || confirmedCount() === 0}
                class="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Send size={14} />
                {sending()
                  ? `Mengirim... (${progress()?.sent ?? 0} terkirim)`
                  : `Kirim ke ${confirmedCount()} Subscriber`}
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title={`Daftar Subscriber (${total()})`}
            actions={
              <div class="flex flex-wrap items-end gap-2">
                <PageSizeSelect value={pageSize()} onChange={changePageSize} />
                <div class="flex flex-wrap items-center gap-0.5 self-end rounded-lg border border-slate-200 p-0.5 text-xs">
                  <For each={STATUS_FILTERS}>
                    {(option) => (
                      <button
                        type="button"
                        aria-pressed={statusFilter() === option.value}
                        class={`rounded-md px-2.5 py-1 transition ${
                          statusFilter() === option.value
                            ? "bg-emerald-600 font-semibold text-white"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                        onClick={() => changeStatusFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
          />
          <Suspense fallback={<div class="p-8 text-center text-sm text-slate-500">Memuat...</div>}>
            <Show
              when={subscribers().length > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">
                  {statusFilter() === "ALL"
                    ? "Belum ada subscriber. Email dari landing page akan muncul di sini."
                    : "Tidak ada subscriber dengan status ini."}
                </div>
              }
            >
              <div class="divide-y divide-slate-100">
                <For each={subscribers()}>
                  {(item) => (
                    <div
                      class={`flex items-center gap-4 px-5 py-3.5 transition-opacity ${
                        resendingId() === item.id ? "opacity-60" : ""
                      }`}
                    >
                      <Mail size={16} class="shrink-0 text-slate-400" />
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-medium text-slate-800">{item.email}</span>
                          <Badge tone={STATUS_META[item.status].tone}>{STATUS_META[item.status].label}</Badge>
                        </div>
                        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                          <span>Daftar: {formatDate(item.subscribedAt)}</span>
                          <Show when={item.confirmedAt}>
                            {(confirmedAt) => <span>Konfirmasi: {formatDate(confirmedAt())}</span>}
                          </Show>
                          <Show when={item.unsubscribedAt}>
                            {(unsubscribedAt) => <span>Berhenti: {formatDate(unsubscribedAt())}</span>}
                          </Show>
                        </p>
                      </div>
                      <Show when={item.status === "PENDING"}>
                        <button
                          type="button"
                          title="Kirim ulang email konfirmasi"
                          aria-label={`Kirim ulang email konfirmasi ke ${item.email}`}
                          aria-busy={resendingId() === item.id}
                          disabled={resendingId() === item.id}
                          class="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleResend(item)}
                        >
                          <RefreshCw size={14} class={resendingId() === item.id ? "animate-spin" : undefined} />
                        </button>
                      </Show>
                      <button
                        type="button"
                        title="Hapus"
                        aria-label={`Hapus ${item.email}`}
                        disabled={resendingId() === item.id}
                        class="shrink-0 rounded-lg border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <TablePagination page={page()} pageSize={pageSize()} total={total()} onPageChange={setPage} />
          </Suspense>
        </Card>
      </div>
    </>
  );
}
