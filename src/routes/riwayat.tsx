import { cache, createAsync } from "@solidjs/router";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { getIrrigationHistory, getMyBlocks } from "~/server/actions";
import { SkTableRow } from "~/components/Sk";

const loadBlocks = cache(() => getMyBlocks(), "my-blocks");
const loadHistory = cache(
  (blockId: string, status: string, mode: string, date: string) =>
    getIrrigationHistory({
      blockId: blockId || undefined,
      status: (status as "ON" | "OFF") || undefined,
      mode: (mode as "AUTO" | "MANUAL") || undefined,
      date: date || undefined,
    }),
  "irrigation-history",
);

export const route = { preload: () => loadBlocks() };

function formatDate(d: Date) {
  return new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function RiwayatIrigasi() {
  const [blockId, setBlockId] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [mode, setMode] = createSignal("");
  const [date, setDate] = createSignal("");

  const blocks = createAsync(() => loadBlocks());
  const history = createAsync(() => loadHistory(blockId(), status(), mode(), date()));

  const reset = () => { setBlockId(""); setStatus(""); setMode(""); setDate(""); };

  return (
    <>
      <Title>Riwayat Irigasi | Adosistering</Title>
      <Meta name="description" content="Riwayat aktivitas irigasi berdasarkan blok, status, jenis, dan tanggal." />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Riwayat Irigasi</h1>

        {/* Filters */}
        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Nama Lahan</label>
            <Suspense fallback={<select class="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>Memuat…</option></select>}>
              <select
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={blockId()}
                onChange={(e) => setBlockId(e.currentTarget.value)}
              >
                <option value="">Pilih nama lahan</option>
                <For each={blocks()}>
                  {(a) => {
                    const b = "block" in a ? a.block : a;
                    return <option value={b.id}>{b.name}</option>;
                  }}
                </For>
              </select>
            </Suspense>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Status Irigasi</label>
            <select
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={status()}
              onChange={(e) => setStatus(e.currentTarget.value)}
            >
              <option value="">Pilih status</option>
              <option value="ON">Nyala</option>
              <option value="OFF">Mati</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Jenis Irigasi</label>
            <select
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={mode()}
              onChange={(e) => setMode(e.currentTarget.value)}
            >
              <option value="">Pilih jenis irigasi</option>
              <option value="AUTO">Otomatis</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-slate-600">Tanggal</label>
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={date()}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
          </div>

          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            onClick={reset}
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
                <tbody>
                  <SkTableRow /><SkTableRow /><SkTableRow /><SkTableRow />
                </tbody>
              </table>
            }
          >
            <Show
              when={(history() ?? []).length > 0}
              fallback={
                <div class="p-10 text-center text-sm text-slate-500">
                  Tidak ada data riwayat irigasi dari Firebase.
                </div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th class="px-5 py-3 text-left">Tanggal &amp; Waktu</th>
                      <th class="px-5 py-3 text-left">Lahan</th>
                      <th class="px-5 py-3 text-left">Sprayer</th>
                      <th class="px-5 py-3 text-left">Jenis</th>
                      <th class="px-5 py-3 text-left">Status</th>
                      <th class="px-5 py-3 text-left">Oleh</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={history()}>
                      {(event) => (
                        <tr class="hover:bg-slate-50">
                          <td class="px-5 py-3 text-slate-600">{formatDate(event.startedAt)}</td>
                          <td class="px-5 py-3 font-medium text-slate-900">{event.block.name}</td>
                          <td class="px-5 py-3 text-slate-600">{event.sprayer.displayName}</td>
                          <td class="px-5 py-3">
                            <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.mode === "AUTO" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                              {event.mode === "AUTO" ? "Otomatis" : "Manual"}
                            </span>
                          </td>
                          <td class="px-5 py-3">
                            <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.relay === "ON" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {event.relay === "ON" ? "Nyala" : "Mati"}
                            </span>
                          </td>
                          <td class="px-5 py-3 text-slate-500">{event.actor?.name ?? "Otomatis"}</td>
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
    </>
  );
}
