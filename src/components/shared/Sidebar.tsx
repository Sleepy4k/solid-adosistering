import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  BarChart3,
  ChevronLeft,
  ClipboardList,
  Contact,
  FileClock,
  HelpCircle,
  History,
  Home,
  LogOut,
  Map,
  MapPinned,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-solid";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import fallbackLogo from "~/assets/logo.svg?url";
import { ROUTES } from "~/constants/routes";
import { logout } from "~/server/actions/index";
import type { SessionUser } from "~/server/session";
import { useWebConfig } from "~/lib/shared/webConfig";
import { useConfirm } from "./ConfirmProvider";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }) => JSX.Element;
  adminOnly?: boolean;
  superOnly?: boolean;
  userOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { href: ROUTES.home, label: "Beranda", icon: Home },
      { href: ROUTES.irrigationHistory, label: "Riwayat Irigasi", icon: History },
      { href: ROUTES.statistics, label: "Statistik", icon: BarChart3 },
    ],
  },
  {
    label: "Manajemen",
    items: [
      { href: ROUTES.userManagement, label: "Manajemen User", icon: Users, adminOnly: true },
      { href: ROUTES.regionManagement, label: "Manajemen Region", icon: MapPinned, superOnly: true },
      { href: ROUTES.mapConfiguration, label: "Konfigurasi Peta", icon: Map, superOnly: true },
    ],
  },
  {
    label: "Audit",
    items: [
      { href: ROUTES.systemLog, label: "Log Sistem", icon: FileClock, superOnly: true },
      { href: ROUTES.authLog, label: "Log Autentikasi", icon: ShieldCheck, superOnly: true },
      { href: ROUTES.contactSubmissions, label: "Pesan Masuk", icon: Contact, superOnly: true },
    ],
  },
  {
    label: "Akun",
    items: [
      { href: ROUTES.superadmin, label: "Pengaturan", icon: ClipboardList, superOnly: true },
      { href: ROUTES.settings, label: "Pengaturan", icon: Settings, userOnly: true },
      { href: ROUTES.profile, label: "Profil", icon: User },
    ],
  },
];

function Logo(props: { collapsed?: boolean }) {
  const config = useWebConfig();
  return (
    <div class={`flex items-center justify-center ${props.collapsed ? "" : "px-2"}`}>
      <img
        src={config().logoUrl || fallbackLogo}
        alt={config().projectName}
        class={`${props.collapsed ? "h-10" : "h-14"} w-auto shrink-0`}
      />
    </div>
  );
}

type SidebarProps = {
  user: SessionUser;
  mobile?: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
};

export default function Sidebar(props: SidebarProps) {
  const isCollapsed = () => !props.mobile && (props.collapsed ?? false);
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const isActive = (href: string) =>
    href === ROUTES.dashboard ? location.pathname === ROUTES.dashboard : location.pathname.startsWith(href);
  const helpActive = () => isActive(ROUTES.helpCenter);
  const visibleGroups = () =>
    NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superOnly && props.user.role !== "SUPERADMIN") return false;
        if (item.adminOnly && props.user.role === "USER") return false;
        if (item.userOnly && props.user.role !== "USER") return false;
        return true;
      }),
    })).filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    const ok = await confirm({
      title: "Keluar dari akun?",
      message: "Sesi aktif akan dihentikan pada perangkat ini.",
      confirmLabel: "Log Out",
      tone: "danger",
    });
    if (!ok) return;
    await logout().catch(() => undefined);
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <aside
      class={`flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white transition-all duration-300 ${
        props.mobile ? "w-full" : isCollapsed() ? "w-20" : "w-64"
      }`}
    >
      <div class={`shrink-0 px-4 py-5 ${isCollapsed() ? "px-2" : ""}`}>
        <Logo collapsed={isCollapsed()} />
        <div class="mx-auto mt-4 h-px w-4/5 bg-gray-200" />
        <Show when={!props.mobile}>
          <div class={`mt-3 flex ${isCollapsed() ? "justify-center" : "justify-end"}`}>
            <button
              type="button"
              class={`grid h-9 w-9 place-items-center rounded-xl border border-gray-200 text-[#4F4F4F] transition-transform hover:bg-gray-50 ${
                isCollapsed() ? "rotate-180" : ""
              }`}
              aria-label="Toggle sidebar"
              onClick={props.onCollapse}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </Show>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-3">
        <div class="space-y-4 pb-2">
          <For each={visibleGroups()}>
            {(group) => (
              <section>
                <Show when={!isCollapsed()}>
                  <p class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </p>
                </Show>
                <ul class="space-y-1">
                  <For each={group.items}>
                    {(item) => {
                      const active = () => isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <li>
                          <A
                            href={item.href}
                            onClick={(event) => {
                              if (active()) {
                                event.preventDefault();
                                return;
                              }
                              props.onNavigate?.();
                            }}
                            title={isCollapsed() ? item.label : undefined}
                            aria-current={active() ? "page" : undefined}
                            aria-disabled={active() ? "true" : undefined}
                            class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                              active() ? "cursor-default bg-[#67B744] text-white" : "text-[#111827] hover:bg-gray-50"
                            } ${isCollapsed() ? "justify-center" : ""}`}
                          >
                            <Icon size={20} class="shrink-0" aria-hidden="true" />
                            <Show when={!isCollapsed()}>
                              <span class="truncate">{item.label}</span>
                            </Show>
                          </A>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </nav>

      <div class="shrink-0 space-y-1 px-3 pb-4">
        <A
          href={ROUTES.helpCenter}
          onClick={(event) => {
            if (helpActive()) {
              event.preventDefault();
              return;
            }
            props.onNavigate?.();
          }}
          title={isCollapsed() ? "Pusat Bantuan" : undefined}
          aria-current={helpActive() ? "page" : undefined}
          aria-disabled={helpActive() ? "true" : undefined}
          class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
            helpActive() ? "cursor-default bg-[#67B744] text-white" : "text-[#111827] hover:bg-gray-50"
          } ${isCollapsed() ? "justify-center" : ""}`}
        >
          <HelpCircle size={20} class="shrink-0" aria-hidden="true" />
          <Show when={!isCollapsed()}>
            <span class="truncate">Pusat Bantuan</span>
          </Show>
        </A>
        <button
          type="button"
          class={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-[#111827] transition-colors hover:bg-red-50 hover:text-red-600 ${
            isCollapsed() ? "justify-center" : ""
          }`}
          title={isCollapsed() ? "Log Out" : undefined}
          onClick={handleLogout}
        >
          <LogOut size={20} class="shrink-0" aria-hidden="true" />
          <Show when={!isCollapsed()}>
            <span>Log Out</span>
          </Show>
        </button>
      </div>
    </aside>
  );
}
