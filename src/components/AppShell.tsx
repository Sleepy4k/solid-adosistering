import { createAsync, useBeforeLeave, useLocation } from "@solidjs/router";
import type { JSX } from "solid-js";
import { createEffect, Show, Suspense, onMount } from "solid-js";
import NProgress from "nprogress";
import { getUser } from "~/server/auth";
import Sidebar from "./Sidebar";

NProgress.configure({ showSpinner: false, speed: 300, minimum: 0.08 });

function RouterProgress() {
  const location = useLocation();

  // Start the bar when a navigation begins (before the new page mounts)
  useBeforeLeave(() => NProgress.start());

  // Finish the bar when the new page component mounts
  onMount(() => NProgress.done());

  // Also finish if the route changes without a full remount (query-param changes)
  createEffect(() => {
    void location.pathname;
    NProgress.done();
  });

  return null;
}

function PageAvatar(props: { name: string }) {
  const initials = () => {
    const parts = props.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  return (
    <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
      {initials()}
    </div>
  );
}

export default function AppShell(props: { children: JSX.Element }) {
  const user = createAsync(() => getUser());

  return (
    <div class="flex h-screen overflow-hidden bg-slate-50">
      <Suspense
        fallback={
          <aside class="flex h-screen w-[230px] shrink-0 flex-col border-r border-slate-200 bg-white">
            <div class="h-16 border-b border-slate-100" />
          </aside>
        }
      >
        <Show when={user()}>
          {(u) => <Sidebar user={u()} />}
        </Show>
      </Suspense>

      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header class="flex h-16 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          <Suspense>
            <Show when={user()}>
              {(u) => (
                <>
                  <span class="text-sm text-slate-500">
                    {new Date().toLocaleDateString("id-ID", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <PageAvatar name={u().name} />
                </>
              )}
            </Show>
          </Suspense>
        </header>

        {/* Page content */}
        <main class="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<div class="h-1 w-full animate-pulse rounded bg-emerald-200" />}>
            <RouterProgress />
            <div class="page-enter">
              {props.children}
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
