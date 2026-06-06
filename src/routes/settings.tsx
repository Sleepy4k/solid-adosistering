import { query, createAsync } from "@solidjs/router";
import { lazy, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { SkCard } from "~/components/shared/Skeleton";
import { getMySettings } from "~/server/actions/index";
import type { AdminSettingsData, UserSettingsData } from "~/features/settings/types";
import { useLiveDate } from "~/lib/client/liveDate";

const loadSettings = query(() => getMySettings(), "my-settings");
export const route = { preload: () => loadSettings() };

const UserSettings = lazy(() => import("~/features/settings/UserSettings").then((m) => ({ default: m.UserSettings })));
const AdminSettings = lazy(() =>
  import("~/features/settings/AdminSettings").then((m) => ({ default: m.AdminSettings })),
);
const RestrictedSettings = lazy(() =>
  import("~/features/settings/RestrictedSettings").then((m) => ({ default: m.RestrictedSettings })),
);

export default function Pengaturan() {
  const settings = createAsync(() => loadSettings());
  const liveDate = useLiveDate();

  return (
    <>
      <PageMeta page="settings" />

      <div class="space-y-6">
        <div class="rounded-2xl border border-[#C2C2C2] bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 class="text-xl font-bold text-[#4F4F4F] sm:text-2xl">Pengaturan</h1>
            <p class="text-xs text-gray-500 sm:text-sm">{liveDate().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        <Suspense
          fallback={
            <div class="flex flex-col gap-4">
              <SkCard />
              <SkCard />
            </div>
          }
        >
          <Show when={settings()}>
            {(data) => (
              <Show
                when={data().role === "USER"}
                fallback={
                  <Show when={data().role === "ADMIN"} fallback={<RestrictedSettings role="SUPERADMIN" />}>
                    <AdminSettings settings={data() as AdminSettingsData} />
                  </Show>
                }
              >
                <UserSettings settings={data() as UserSettingsData} />
              </Show>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
