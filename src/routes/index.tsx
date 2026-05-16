import { A, cache, createAsync } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";
import { Plus, Search } from "lucide-solid";
import { createEffect, For, onMount, Show, Suspense } from "solid-js";
import { Card } from "~/components/ui/Card";
import { PageHeader } from "~/components/ui/PageHeader";
import { SkCard } from "~/components/shared/Skeleton";
import { finishProgress, startProgress } from "~/lib/client/progress";
import {
  getMyDashboard,
  type AdminUserCard,
  type DashboardRegion,
  type SuperadminSummary,
} from "~/server/actions/index";
import { AdminUserSensorCard } from "~/features/dashboard/AdminUserSensorCard";
import { MapCard } from "~/features/dashboard/MapCard";
import { RegionSection } from "~/features/dashboard/RegionSection";
import { SuperadminDashboard } from "~/features/dashboard/SuperadminDashboard";

const loadDashboard = cache(() => getMyDashboard(), "dashboard");

export const route = { preload: () => loadDashboard() };

function todayLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function UserDashboard(props: { regions: DashboardRegion[] }) {
  return (
    <div class="space-y-5">
      <Card class="px-5 py-4 text-sm italic text-[#4F4F4F]">
        Irigasi otomatis menyalakan pompa berdasarkan kelembaban tanah. Batas kelembaban tanah dapat diatur pada menu{" "}
        <A href="/settings" class="font-semibold text-[#186D3C] underline">
          pengaturan
        </A>
        .
      </Card>
      <MapCard regions={props.regions} />
      <For each={props.regions}>{(region) => <RegionSection region={region} />}</For>
      <Show when={props.regions.length === 0}>
        <Card class="p-10 text-center text-sm text-[#6B6B6B]">Belum ada blok yang ditetapkan untuk akun ini.</Card>
      </Show>
    </div>
  );
}

function AdminDashboard(props: { users: AdminUserCard[] }) {
  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <select class="form-input h-11 rounded-xl text-sm">
            <option>Semua Status Sensor</option>
            <option>Terhubung</option>
            <option>Terputus</option>
          </select>
          <select class="form-input h-11 rounded-xl text-sm">
            <option>Semua Status Pompa</option>
            <option>Aktif</option>
            <option>Mati</option>
          </select>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input class="form-input h-11 rounded-xl pl-9 text-sm" placeholder="Cari pengguna atau IoT" />
          </div>
        </div>
        <A
          href="/user-management/create"
          class="btn-3d-green inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-medium text-white"
        >
          <Plus size={16} />
          Tambah Pengguna
        </A>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <For each={props.users}>{(user) => <AdminUserSensorCard user={user} />}</For>
      </div>

      <Show when={props.users.length === 0}>
        <Card class="p-10 text-center text-sm text-[#6B6B6B]">Belum ada pengguna yang terdaftar.</Card>
      </Show>
    </div>
  );
}

export default function Beranda() {
  const dashboard = createAsync(() => loadDashboard());

  onMount(() => {
    void startProgress({ immediate: true });
  });

  createEffect(() => {
    if (dashboard()) void finishProgress();
  });

  return (
    <>
      <PageMeta page="home" />

      <div class="space-y-5">
        <PageHeader
          title="Beranda"
          actions={<p class="text-sm font-medium capitalize text-slate-500">{todayLabel()}</p>}
        />

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
                  <AdminDashboard users={(data() as { type: "admin"; users: AdminUserCard[] }).users} />
                </Show>
              </>
            )}
          </Show>
        </Suspense>
      </div>
    </>
  );
}
