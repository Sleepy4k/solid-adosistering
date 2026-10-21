import { createAsync } from "@solidjs/router";
import { Menu, X } from "lucide-solid";
import type { JSX } from "solid-js";
import { createSignal, Show, Suspense } from "solid-js";
import { PageSkeleton } from "~/components/shared/PageSkeleton";
import Sidebar from "~/components/shared/Sidebar";
import { getUser } from "~/server/auth";

export default function AppShell(props: { children: JSX.Element }) {
  const user = createAsync(() => getUser());
  const [menuOpen, setMenuOpen] = createSignal<boolean>(false);
  const [collapsed, setCollapsed] = createSignal<boolean>(false);

  return (
    <div class="min-h-dvh bg-gray-50">
      <Suspense>
        <Show when={user()}>
          {(u) => (
            <>
              <div
                class={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 xl:block ${collapsed() ? "w-20" : "w-64"}`}
              >
                <Sidebar user={u()} collapsed={collapsed()} onCollapse={() => setCollapsed((v) => !v)} />
              </div>

              <Show when={menuOpen()}>
                <div class="fixed inset-0 z-50 xl:hidden">
                  <button
                    type="button"
                    class="absolute inset-0 bg-black/40"
                    aria-label="Tutup menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl">
                    <div class="flex h-14 shrink-0 items-center justify-end border-b border-gray-200 px-4">
                      <button
                        type="button"
                        class="grid h-11 w-11 place-items-center rounded-xl border border-gray-200 text-[#4F4F4F]"
                        onClick={() => setMenuOpen(false)}
                        aria-label="Tutup menu"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div class="min-h-0 flex-1">
                      <Sidebar user={u()} mobile onNavigate={() => setMenuOpen(false)} />
                    </div>
                  </div>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Suspense>

      <button
        type="button"
        class="fixed left-4 top-4 z-30 grid h-11 w-11 place-items-center rounded-xl border border-gray-200 bg-white text-[#4F4F4F] shadow-sm hover:bg-gray-50 xl:hidden"
        onClick={() => setMenuOpen(true)}
        aria-label="Buka menu"
      >
        <Menu size={20} />
      </button>

      <div class={`transition-[padding] duration-300 ${collapsed() ? "xl:pl-20" : "xl:pl-64"}`}>
        <main class="px-4 pb-8 pt-20 sm:px-6 xl:px-8 xl:pt-8">
          <Suspense fallback={<PageSkeleton />}>
            <div class="page-enter mx-auto max-w-7xl">{props.children}</div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
