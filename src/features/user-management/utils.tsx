import type { Role } from "@prisma/client";
import type { UserListItem } from "~/types/users";

export function roleBadge(role: Role) {
  const map: Record<Role, { label: string; cls: string }> = {
    SUPERADMIN: { label: "Superadmin", cls: "bg-violet-100 text-violet-700" },
    ADMIN: { label: "Admin", cls: "bg-sky-100 text-sky-700" },
    USER: { label: "User", cls: "bg-slate-100 text-slate-700" },
  };
  const { label, cls } = map[role];
  return <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function regionLabel(regions: UserListItem["regions"]) {
  return regions.length > 0 ? regions.map((region) => region.name).join(", ") : "Belum di-assign";
}
