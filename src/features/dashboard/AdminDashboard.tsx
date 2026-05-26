import { A } from "@solidjs/router";
import { Plus, Search } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Card } from "~/components/ui/Card";
import { SelectSearch } from "~/components/ui/SelectSearch";
import type { AdminUserCard, DashboardRegion } from "./DashboardTypes";
import { AdminUserSensorCard } from "./AdminUserSensorCard";
import { MapCard } from "./MapCard";

export function AdminDashboard(props: { users: AdminUserCard[]; regions: DashboardRegion[] }) {
  const [sensorStatus, setSensorStatus] = createSignal("");
  const [pumpStatus, setPumpStatus] = createSignal("");

  const filteredUsers = () => {
    let users = props.users;
    if (sensorStatus()) {
      users = users.filter((u) =>
        sensorStatus() === "connected" ? u.sprayersByBlock.length > 0 : u.sprayersByBlock.length === 0,
      );
    }
    return users;
  };

  return (
    <div class="space-y-5">
      <MapCard regions={props.regions} />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <SelectSearch
            value={sensorStatus()}
            placeholder="Semua Status Sensor"
            options={[
              { value: "", label: "Semua Status Sensor" },
              { value: "connected", label: "Terhubung" },
              { value: "disconnected", label: "Terputus" },
            ]}
            onChange={setSensorStatus}
          />
          <SelectSearch
            value={pumpStatus()}
            placeholder="Semua Status Pompa"
            options={[
              { value: "", label: "Semua Status Pompa" },
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Mati" },
            ]}
            onChange={setPumpStatus}
          />
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
        <For each={filteredUsers()}>{(user) => <AdminUserSensorCard user={user} />}</For>
      </div>

      <Show when={filteredUsers().length === 0}>
        <Card class="p-10 text-center text-sm text-[#6B6B6B]">Belum ada pengguna yang terdaftar.</Card>
      </Show>
    </div>
  );
}
