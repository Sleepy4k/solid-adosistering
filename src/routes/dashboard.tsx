import { query, createAsync } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";
import { SkCard } from "~/components/shared/Skeleton";
import { PageHeader } from "~/components/ui/PageHeader";
import { ErrorBoundary, lazy, Show, Suspense } from "solid-js";
import { getMyDashboard } from "~/server/actions/index";
import type { AdminUserCard, DashboardRegion, SuperadminSummary } from "~/types/dashboard";

const loadDashboard = query(() => getMyDashboard(), "dashboard");

export const route = { preload: () => loadDashboard() };

const SuperadminDashboard = lazy(() =>
  import("~/features/dashboard/SuperadminDashboard").then((m) => ({ default: m.SuperadminDashboard })),
);
const UserDashboard = lazy(() =>
  import("~/features/dashboard/UserDashboard").then((m) => ({ default: m.UserDashboard })),
);
const AdminDashboard = lazy(() =>
  import("~/features/dashboard/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);

function todayLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function Beranda() {
  const dashboard = createAsync(() => loadDashboard());

  return (
    <>
      <PageMeta page="home" />

      <div class="space-y-5">
        <PageHeader
          title="Beranda"
          actions={<p class="text-sm font-medium capitalize text-slate-500">{todayLabel()}</p>}
        />

        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p class="mb-3 text-sm text-red-700">
                {err instanceof Response ? "Gagal memuat data beranda." : String(err)}
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
                <SkCard />
              </div>
            }
          >
            <Show when={dashboard()}>
              {(data) => (
                <>
                  <Show when={data().type === "superadmin"}>
                    <SuperadminDashboard
                      summary={(data() as { type: "superadmin"; summary: SuperadminSummary }).summary}
                    />
                  </Show>
                  <Show when={data().type === "user"}>
                    <UserDashboard regions={(data() as { type: "user"; regions: DashboardRegion[] }).regions} />
                  </Show>
                  <Show when={data().type === "admin"}>
                    <AdminDashboard
                      users={(data() as { type: "admin"; users: AdminUserCard[]; regions: DashboardRegion[] }).users}
                      regions={
                        (data() as { type: "admin"; users: AdminUserCard[]; regions: DashboardRegion[] }).regions
                      }
                    />
                  </Show>
                </>
              )}
            </Show>
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
