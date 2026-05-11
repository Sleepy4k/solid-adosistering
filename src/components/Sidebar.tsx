import { A, useLocation, useNavigate } from "@solidjs/router";
import { createSignal, Show, type JSX } from "solid-js";
import { logout } from "~/server/actions";
import { useConfirm } from "./ConfirmProvider";
import type { SessionUser } from "~/server/session";

type NavItem = {
  href: string;
  label: string;
  icon: JSX.Element;
  adminOnly?: boolean;
  superOnly?: boolean;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcoHome = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline stroke-linecap="round" stroke-linejoin="round" points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IcoHistory = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" /><polyline stroke-linecap="round" points="12 6 12 12 16 14" />
  </svg>
);
const IcoUser = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IcoUsers = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path stroke-linecap="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IcoChart = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <line stroke-linecap="round" x1="18" y1="20" x2="18" y2="10" />
    <line stroke-linecap="round" x1="12" y1="20" x2="12" y2="4" />
    <line stroke-linecap="round" x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IcoSettings = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path stroke-linecap="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IcoMap = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <polygon stroke-linecap="round" stroke-linejoin="round" points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line stroke-linecap="round" x1="8" y1="2" x2="8" y2="18" />
    <line stroke-linecap="round" x1="16" y1="6" x2="16" y2="22" />
  </svg>
);
const IcoRegion = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IcoLogs = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline stroke-linecap="round" points="14 2 14 8 20 8" />
    <line stroke-linecap="round" x1="16" y1="13" x2="8" y2="13" />
    <line stroke-linecap="round" x1="16" y1="17" x2="8" y2="17" />
    <line stroke-linecap="round" x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const IcoLogout = () => (
  <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
    <path stroke-linecap="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline stroke-linecap="round" points="16 17 21 12 16 7" />
    <line stroke-linecap="round" x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const AppLogo = () => (
  <div class="flex items-center gap-3">
    <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600">
      <svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
      </svg>
    </div>
    <div class="overflow-hidden">
      <p class="truncate text-sm font-bold leading-4 text-slate-900">Adosistering</p>
      <p class="truncate text-[11px] text-slate-500">IoT Irrigation</p>
    </div>
  </div>
);

// ─── Nav items (role-gated) ───────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Beranda", icon: <IcoHome /> },
  { href: "/riwayat", label: "Riwayat Irigasi", icon: <IcoHistory /> },
  { href: "/statistik", label: "Statistik", icon: <IcoChart /> },
  { href: "/manajemen-user", label: "Manajemen User", icon: <IcoUsers />, adminOnly: true },
  { href: "/region", label: "Manajemen Region", icon: <IcoRegion />, superOnly: true },
  { href: "/peta-konfigurasi", label: "Konfigurasi Peta", icon: <IcoMap />, superOnly: true },
  { href: "/log-sistem", label: "Log Sistem", icon: <IcoLogs />, superOnly: true },
  { href: "/pengaturan", label: "Pengaturan", icon: <IcoSettings /> },
  { href: "/profil", label: "Profil", icon: <IcoUser /> },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar(props: { user: SessionUser }) {
  const [collapsed, setCollapsed] = createSignal(false);
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const isActive = (href: string) =>
    href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.superOnly && props.user.role !== "SUPERADMIN") return false;
    if (item.adminOnly && props.user.role === "USER") return false;
    return true;
  });

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Keluar dari akun?",
      message: "Sesi aktif akan dihentikan pada perangkat ini.",
      confirmLabel: "Log Out",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await logout();
    } catch {
      // session already invalid
    }
    // replace: true prevents Back button from returning to dashboard
    navigate("/login", { replace: true });
  };

  return (
    <aside
      class={`relative flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-300 ${
        collapsed() ? "w-16" : "w-[230px]"
      }`}
    >
      {/* Logo */}
      <div class="flex h-16 items-center border-b border-slate-100 px-4">
        <Show
          when={!collapsed()}
          fallback={
            <div class="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600">
              <svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
              </svg>
            </div>
          }
        >
          <AppLogo />
        </Show>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        aria-label="Toggle sidebar"
        class={`absolute -right-3 top-[4.5rem] z-10 grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-transform duration-300 ${
          collapsed() ? "rotate-180" : ""
        }`}
        onClick={() => setCollapsed((v) => !v)}
      >
        <svg class="h-3 w-3 text-slate-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Nav */}
      <nav class="flex-1 overflow-y-auto py-4">
        <ul class="flex flex-col gap-1 px-3">
          {visibleItems.map((item) => (
            <li>
              <A
                href={item.href}
                class={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                title={collapsed() ? item.label : undefined}
              >
                <span class="shrink-0">{item.icon}</span>
                <Show when={!collapsed()}>
                  <span class="truncate">{item.label}</span>
                </Show>
              </A>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom: logout */}
      <div class="border-t border-slate-100 px-3 py-4">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={handleLogout}
          title={collapsed() ? "Log Out" : undefined}
        >
          <span class="shrink-0"><IcoLogout /></span>
          <Show when={!collapsed()}>
            <span class="truncate">Log Out</span>
          </Show>
        </button>
      </div>
    </aside>
  );
}
