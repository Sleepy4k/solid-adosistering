import { PageMeta } from "~/components/shared/PageMeta";
import { query, createAsync, revalidate } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import ContactRow from "~/features/superadmin/ContactRow";
import { Card, CardHeader } from "~/components/ui/Card";
import { getContactSubmissions } from "~/server/actions/index";

type ContactRowData = Awaited<ReturnType<typeof getContactSubmissions>>[number];

const loadContacts = query(() => getContactSubmissions(), "superadmin-contacts");
const preloadContactSubmissions = () => loadContacts();

export const route = { preload: preloadContactSubmissions };

export default function ContactSubmissionsRoute() {
  const contacts = createAsync<ContactRowData[]>(() => loadContacts());
  const [showUnreadOnly, setShowUnreadOnly] = createSignal(false);
  const refresh = async () => revalidate("superadmin-contacts");
  const allContacts = () => (contacts() ?? []) as ContactRowData[];
  const filtered = () => {
    const list = allContacts();
    return showUnreadOnly() ? list.filter((contact) => !contact.isRead) : list;
  };
  const unreadCount = () => allContacts().filter((contact) => !contact.isRead).length;

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
