import { createAsync, revalidate } from "@solidjs/router";
import { ErrorBoundary, For, Show, Suspense } from "solid-js";
import { Card, CardHeader } from "~/components/ui/Card";
import { loadRegionsConfig } from "./loaders";
import { RegionConfigRow } from "./RegionConfigRow";

export function RegionConfigSection() {
  const regions = createAsync(() => loadRegionsConfig());

  const refresh = async () => {
    await revalidate("superadmin-regions-config");
  };

  return (
    <Card class="overflow-hidden">
      <CardHeader title="Konfigurasi Region" />
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="p-6 text-center">
            <p class="mb-3 text-sm text-red-600">
              {err instanceof Response ? "Gagal memuat konfigurasi region." : String(err)}
            </p>
            <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
              Coba lagi
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
          <Show when={regions()}>
            {(rows) => (
              <Show
                when={rows().length > 0}
                fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Belum ada region.</div>}
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                      <tr>
                        <th class="px-5 py-3 text-left">Nama Region</th>
                        <th class="px-5 py-3 text-left">Pembagi Volume</th>
                        <th class="px-5 py-3 text-left">Arah Angin</th>
                        <th class="px-5 py-3 text-left">Irigasi Otomatis</th>
                        <th class="px-5 py-3 text-left" />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={rows()}>{(region) => <RegionConfigRow region={region} onSaved={refresh} />}</For>
                    </tbody>
                  </table>
                </div>
              </Show>
            )}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </Card>
  );
}
