import { A, cache, createAsync, useParams } from "@solidjs/router";
import { ErrorBoundary, For, Show, Suspense } from "solid-js";
import { ArrowLeft, Eye } from "lucide-solid";
import { PageMeta } from "~/components/shared/PageMeta";
import { Card } from "~/components/ui/Card";
import { PageHeader } from "~/components/ui/PageHeader";
import { SkCard } from "~/components/shared/Skeleton";
import { getUserDashboardView } from "~/server/actions/index";
import { RegionSection } from "~/features/dashboard/RegionSection";
import { MapCard } from "~/features/dashboard/MapCard";
import { ROUTES } from "~/constants/routes";

const loadUserView = cache((userId: string) => getUserDashboardView(userId), "admin-view");

export const route = { preload: () => undefined };

export default function AdminView() {
  const params = useParams<{ userId: string }>();
  const data = createAsync(() => loadUserView(params.userId));

  return (
    <>
      <PageMeta page="home" />

      <div class="space-y-5">
        <PageHeader
          title="Tampilan Data Pengguna"
          description={
            <p class="mt-1 text-sm text-slate-500">Mode tampilan — tidak ada perubahan yang dapat dilakukan.</p>
          }
          actions={
            <A
              href={ROUTES.dashboard}
              class="inline-flex items-center gap-2 rounded-xl border border-[#C2C2C2] bg-white px-4 py-2 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50"
            >
              <ArrowLeft size={16} />
              Kembali ke Beranda
            </A>
          }
        />

        <div class="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <Eye size={16} class="shrink-0" />
          <span>Anda sedang melihat data pengguna ini sebagai tampilan saja. Tidak ada aksi yang dapat dilakukan.</span>
        </div>

        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p class="mb-3 text-sm text-red-700">
                {err instanceof Response ? "Gagal memuat data pengguna." : String(err)}
              </p>
              <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
                Coba lagi
              </button>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div class="grid gap-4">
                <SkCard />
                <SkCard />
              </div>
            }
          >
            <Show when={data()}>
              {(view) => (
                <Show
                  when={view().regions.length > 0}
                  fallback={
                    <Card class="p-10 text-center text-sm text-[#6B6B6B]">
                      Pengguna ini belum memiliki region yang ditetapkan.
                    </Card>
                  }
                >
                  <div class="space-y-5">
                    <MapCard regions={view().regions} />
                    <For each={view().regions}>{(region) => <RegionSection region={region} readOnly />}</For>
                  </div>
                </Show>
              )}
            </Show>
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
