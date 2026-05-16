import { A, useLocation, useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { ROUTES } from "~/constants/routes";
import { logout } from "~/server/actions/index";
import type { SessionUser } from "~/server/session";
import logoUrl from "~/assets/logo.svg";
import chartIcon from "~/assets/icons/statistic.svg?url";
import chevronLeftIcon from "~/assets/icons/chevron-left.svg?url";
import helpIcon from "~/assets/icons/help.svg?url";
import historyIcon from "~/assets/icons/history.svg?url";
import homeIcon from "~/assets/icons/home.svg?url";
import locationIcon from "~/assets/icons/location.svg?url";
import logoutIcon from "~/assets/icons/logout.svg?url";
import mapIcon from "~/assets/icons/document-optional.svg?url";
import profileIcon from "~/assets/icons/profile.svg?url";
import settingsIcon from "~/assets/icons/settings.svg?url";
import systemLogIcon from "~/assets/icons/document.svg?url";
import userManagementIcon from "~/assets/icons/management-user.svg?url";
import { useConfirm } from "./ConfirmProvider";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  superOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.home, label: "Beranda", icon: homeIcon },
  { href: ROUTES.irrigationHistory, label: "Riwayat Irigasi", icon: historyIcon },
  { href: ROUTES.statistics, label: "Statistik", icon: chartIcon },
  { href: ROUTES.userManagement, label: "Manajemen User", icon: userManagementIcon, adminOnly: true },
  { href: ROUTES.regionManagement, label: "Manajemen Region", icon: locationIcon, superOnly: true },
  { href: ROUTES.mapConfiguration, label: "Konfigurasi Peta", icon: mapIcon, superOnly: true },
  { href: ROUTES.systemLog, label: "Log Sistem", icon: systemLogIcon, superOnly: true },
  { href: ROUTES.settings, label: "Pengaturan", icon: settingsIcon },
  { href: ROUTES.profile, label: "Profil", icon: profileIcon },
];

function Logo(props: { collapsed?: boolean }) {
  return (
    <div class={`flex items-center justify-center ${props.collapsed ? "" : "px-2"}`}>
      <img src={logoUrl} alt="Adosistering" class={`${props.collapsed ? "h-12" : "h-16"} w-auto shrink-0`} />
    </div>
  );
}

export default function Sidebar(props: { user: SessionUser; mobile?: boolean; onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = createSignal(false);
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const isActive = (href: string) => (href === "/" ? location.pathname === "/" : location.pathname.startsWith(href));
  const helpActive = () => isActive(ROUTES.helpCenter);
  const visibleItems = () =>
    NAV_ITEMS.filter((item) => {
      if (item.superOnly && props.user.role !== "SUPERADMIN") return false;
      if (item.adminOnly && props.user.role === "USER") return false;
      if (item.href === ROUTES.settings && props.user.role !== "USER") return false;
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
    await logout().catch(() => undefined);
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <aside
      class={`flex h-full shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-all duration-300 ${
        props.mobile ? "w-full" : collapsed() ? "w-20" : "w-64"
      }`}
    >
      <div class="px-4 py-6">
        <Logo collapsed={!props.mobile && collapsed()} />
        <div class="mx-auto mt-6 h-px w-4/5 bg-gray-200" />
        <Show when={!props.mobile}>
          <div class={`mt-4 flex ${collapsed() ? "justify-center" : "justify-end"}`}>
            <button
              type="button"
              class={`grid h-10 w-10 place-items-center rounded-xl border border-gray-200 text-[#4F4F4F] hover:bg-gray-50 ${
                collapsed() ? "rotate-180" : ""
              }`}
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed((value) => !value)}
            >
              <img src={chevronLeftIcon} alt="" class="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </Show>
      </div>

      <nav class="flex-1 overflow-y-auto px-4">
        <ul class="space-y-2">
          <For each={visibleItems()}>
            {(item) => {
              const active = () => isActive(item.href);
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
                    title={!props.mobile && collapsed() ? item.label : undefined}
                    aria-current={active() ? "page" : undefined}
                    aria-disabled={active() ? "true" : undefined}
                    class={`flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                      active() ? "cursor-default bg-[#67B744] text-white" : "text-[#4F4F4F] hover:bg-gray-50"
                    } ${!props.mobile && collapsed() ? "justify-center" : ""}`}
                  >
                    <img
                      src={item.icon}
                      alt=""
                      class={`h-5 w-5 shrink-0 object-contain ${active() ? "brightness-0 invert" : ""}`}
                      aria-hidden="true"
                    />
                    <Show when={props.mobile || !collapsed()}>
                      <span class="whitespace-nowrap">{item.label}</span>
                    </Show>
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </nav>

      <div class="space-y-2 px-4 pb-6">
        <A
          href={ROUTES.helpCenter}
          onClick={(event) => {
            if (helpActive()) {
              event.preventDefault();
              return;
            }
            props.onNavigate?.();
          }}
          title={!props.mobile && collapsed() ? "Pusat Bantuan" : undefined}
          aria-current={helpActive() ? "page" : undefined}
          aria-disabled={helpActive() ? "true" : undefined}
          class={`flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] transition-colors ${
            helpActive() ? "cursor-default bg-[#67B744] text-white" : "text-[#4F4F4F] hover:bg-gray-50"
          } ${!props.mobile && collapsed() ? "justify-center" : ""}`}
        >
          <img
            src={helpIcon}
            alt=""
            class={`h-5 w-5 shrink-0 object-contain ${helpActive() ? "brightness-0 invert" : ""}`}
            aria-hidden="true"
          />
          <Show when={props.mobile || !collapsed()}>
            <span class="whitespace-nowrap">Pusat Bantuan</span>
          </Show>
        </A>
        <button
          type="button"
          class={`flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-[15px] text-[#4F4F4F] hover:bg-red-50 hover:text-red-600 ${
            !props.mobile && collapsed() ? "justify-center" : ""
          }`}
          title={!props.mobile && collapsed() ? "Log Out" : undefined}
          onClick={handleLogout}
        >
          <img src={logoutIcon} alt="" class="h-5 w-5 shrink-0 object-contain" aria-hidden="true" />
          <Show when={props.mobile || !collapsed()}>
            <span>Log Out</span>
          </Show>
        </button>
      </div>
    </aside>
  );
}
