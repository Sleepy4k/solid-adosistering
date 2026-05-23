import { cache, createAsync, revalidate } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { Card, CardHeader } from "~/components/ui/Card";
import { getContactSubmissions, markContactRead } from "~/server/actions/index";
import { useToast } from "~/components/shared/ToastProvider";

const loadContacts = cache(() => getContactSubmissions(), "superadmin-contacts");
export const preloadContactSubmissions = () => loadContacts();

type ContactRowData = Awaited<ReturnType<typeof getContactSubmissions>>[number];

function ContactRow(props: { contact: ContactRowData; onUpdate: () => void }) {
  const { notify } = useToast();
  const [loading, setLoading] = createSignal(false);

  const toggle = async () => {
    setLoading(true);
    try {
      await markContactRead({ id: props.contact.id, isRead: !props.contact.isRead });
      props.onUpdate();
    } catch {
      notify({ kind: "error", title: "Gagal memperbarui status." });
    } finally {
      setLoading(false);
    }
  };

  const date = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(props.contact.createdAt));

  return (
    <tr class={`border-b border-gray-100 last:border-0 ${props.contact.isRead ? "opacity-60" : ""}`}>
      <td class="px-5 py-4">
        <p class="font-medium text-[#333]">{props.contact.name}</p>
        <p class="text-xs text-[#6B6B6B]">{props.contact.email}</p>
        <Show when={props.contact.phone}>
          <p class="text-xs text-[#6B6B6B]">{props.contact.phone}</p>
        </Show>
      </td>
      <td class="px-5 py-4 text-xs text-[#6B6B6B]">{props.contact.userType ?? "-"}</td>
      <td class="max-w-xs px-5 py-4 text-sm text-[#4F4F4F]">
        <p class="line-clamp-3 whitespace-pre-wrap">{props.contact.message}</p>
      </td>
      <td class="whitespace-nowrap px-5 py-4 text-xs text-[#6B6B6B]">{date}</td>
      <td class="px-5 py-4">
        <button
          type="button"
          disabled={loading()}
          onClick={toggle}
          class={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
            props.contact.isRead
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          }`}
        >
          {props.contact.isRead ? "Tandai Belum Dibaca" : "Tandai Dibaca"}
        </button>
      </td>
    </tr>
  );
}

export function ContactSubmissionsPage() {
  const contacts = createAsync(() => loadContacts());
  const [showUnreadOnly, setShowUnreadOnly] = createSignal(false);
  const refresh = async () => revalidate("superadmin-contacts");
  const filtered = () => {
    const list = contacts() ?? [];
    return showUnreadOnly() ? list.filter((contact) => !contact.isRead) : list;
  };
  const unreadCount = () => (contacts() ?? []).filter((contact) => !contact.isRead).length;

  return (
    <>
      <PageMeta page="contactSubmissions" />

      <div class="space-y-5">
        <h1 class="text-2xl font-bold text-slate-900">Pesan Masuk</h1>
        <Card class="overflow-hidden">
          <CardHeader
            title={
              <span class="flex items-center gap-2">
                Pesan dari Landing Page
                <Show when={unreadCount() > 0}>
                  <span class="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount()}</span>
                </Show>
              </span>
            }
            actions={
              <label class="flex cursor-pointer items-center gap-2 text-sm text-[#4F4F4F]">
                <input
                  type="checkbox"
                  checked={showUnreadOnly()}
                  onChange={(e) => setShowUnreadOnly(e.currentTarget.checked)}
                  class="h-4 w-4 rounded accent-emerald-600"
                />
                Belum dibaca saja
              </label>
            }
          />
          <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
            <Show
              when={filtered().length > 0}
              fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Tidak ada pesan.</div>}
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                    <tr>
                      <th class="px-5 py-3 text-left">Pengirim</th>
                      <th class="px-5 py-3 text-left">Tipe Pengguna</th>
                      <th class="px-5 py-3 text-left">Pesan</th>
                      <th class="px-5 py-3 text-left">Waktu</th>
                      <th class="px-5 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={filtered()}>{(contact) => <ContactRow contact={contact} onUpdate={refresh} />}</For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Suspense>
        </Card>
      </div>
    </>
  );
}
