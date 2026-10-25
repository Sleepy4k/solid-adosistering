import { PageMeta } from "~/components/shared/PageMeta";
import { query, createAsync, revalidate } from "@solidjs/router";
import { createEffect, createSignal, For, Show, Suspense } from "solid-js";
import { RotateCcw, Search } from "lucide-solid";
import ContactRow from "~/features/superadmin/ContactRow";
import { useServerList } from "~/features/superadmin/useServerList";
import { Card, CardHeader } from "~/components/ui/Card";
import { DatePicker } from "~/components/ui/DatePicker";
import { SimpleSelect } from "~/components/ui/SimpleSelect";
import { ariaSort, SortHeader } from "~/components/ui/SortHeader";
import { PageSizeSelect, TablePagination } from "~/components/ui/TablePagination";
import { getContactInbox, type getContactSubmissions } from "~/server/actions/contact";

type ContactRowData = Awaited<ReturnType<typeof getContactSubmissions>>[number];

type ContactInbox = Awaited<ReturnType<typeof getContactInbox>>;

type ContactSortKey = "name" | "email" | "userType" | "createdAt" | "isRead";
type ReadState = "all" | "unread" | "read";

const READ_STATE_OPTIONS: { value: ReadState; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "unread", label: "Belum dibaca" },
  { value: "read", label: "Sudah dibaca" },
];

const loadContacts = query(
  (
    readState: ReadState,
    search: string,
    dateFrom: string,
    dateTo: string,
    sortKey: ContactSortKey,
    sortDir: "asc" | "desc",
    limit: number,
    offset: number,
  ) =>
    getContactInbox({
      readState,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort: { key: sortKey, dir: sortDir },
      limit,
      offset,
    }),
  "superadmin-contacts",
);
const preloadContactSubmissions = () => loadContacts("all", "", "", "", "createdAt", "desc", 25, 0);

export const route = { preload: preloadContactSubmissions };

export default function ContactSubmissionsRoute() {
  const list = useServerList<ContactSortKey>({ defaultSort: { key: "createdAt", dir: "desc" } });
  const [readState, setReadState] = createSignal<ReadState>("all");
  const [dateFrom, setDateFrom] = createSignal<string>("");
  const [dateTo, setDateTo] = createSignal<string>("");
  const inbox = createAsync<ContactInbox>(() =>
    loadContacts(
      readState(),
      list.search(),
      dateFrom(),
      dateTo(),
      list.sort().key,
      list.sort().dir,
      list.pageSize(),
      list.page() * list.pageSize(),
    ),
  );
  const refresh = async () => revalidate("superadmin-contacts");
  const rows = () => (inbox()?.items ?? []) as ContactRowData[];
  const unreadCount = () => inbox()?.unreadCount ?? 0;
  const hasFilters = () => readState() !== "all" || !!list.search() || !!dateFrom() || !!dateTo();

  // Pull the page back into range if rows disappear (e.g. marking read under an unread filter).
  createEffect(() => {
    const total = inbox()?.total;
    if (total === undefined) return;
    const lastPage = Math.max(0, Math.ceil(total / list.pageSize()) - 1);
    if (list.page() > lastPage) list.setPage(lastPage);
  });

  const resetFilters = () =>
    list.resetPageWith(() => {
      setReadState("all");
      setDateFrom("");
      setDateTo("");
      list.onSearchInput("");
    });

  const sortTh = (key: ContactSortKey, label: string) => (
    <th class="whitespace-nowrap px-5 py-3 text-left" aria-sort={ariaSort(list.sort(), key)}>
      <SortHeader label={label} column={key} sort={list.sort()} onSort={list.setSort} />
    </th>
  );

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
            actions={<PageSizeSelect value={list.pageSize()} onChange={list.setPageSize} />}
          />
          <div class="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-4">
            <label class="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-medium text-[#4F4F4F]">
              <span>Cari</span>
              <span class="relative">
                <Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={list.searchInput()}
                  onInput={(e) => list.onSearchInput(e.currentTarget.value)}
                  placeholder="Nama, email, telepon, atau pesan"
                  maxLength={100}
                  class="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </span>
            </label>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-[#4F4F4F]">Status</span>
              <SimpleSelect
                value={readState()}
                options={READ_STATE_OPTIONS}
                onChange={(value) => list.resetPageWith(() => setReadState(value as ReadState))}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-[#4F4F4F]">Dari Tanggal</span>
              <DatePicker
                value={dateFrom()}
                placeholder="Dari tanggal"
                onChange={(value) => list.resetPageWith(() => setDateFrom(value))}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-[#4F4F4F]">Sampai Tanggal</span>
              <DatePicker
                value={dateTo()}
                placeholder="Sampai tanggal"
                onChange={(value) => list.resetPageWith(() => setDateTo(value))}
              />
            </div>
            <Show when={hasFilters()}>
              <button
                type="button"
                class="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                onClick={resetFilters}
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </Show>
          </div>
          <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
            <Show
              when={rows().length > 0}
              fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Tidak ada pesan.</div>}
            >
              <div class="overflow-x-auto">
                <table class="w-full min-w-[840px] text-sm">
                  <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                    <tr>
                      <th
                        class="whitespace-nowrap px-5 py-3 text-left"
                        aria-sort={ariaSort(list.sort(), list.sort().key === "email" ? "email" : "name")}
                      >
                        <div class="flex items-center gap-3">
                          <SortHeader label="Nama" column="name" sort={list.sort()} onSort={list.setSort} />
                          <SortHeader label="Email" column="email" sort={list.sort()} onSort={list.setSort} />
                        </div>
                      </th>
                      {sortTh("userType", "Tipe Pengguna")}
                      <th class="whitespace-nowrap px-5 py-3 text-left">Pesan</th>
                      {sortTh("createdAt", "Waktu")}
                      {sortTh("isRead", "Status")}
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rows()}>{(contact) => <ContactRow contact={contact} onUpdate={refresh} />}</For>
                  </tbody>
                </table>
              </div>
            </Show>
            <TablePagination
              page={list.page()}
              pageSize={list.pageSize()}
              total={inbox()?.total ?? 0}
              onPageChange={list.setPage}
            />
          </Suspense>
        </Card>
      </div>
    </>
  );
}
