import { Router, useLocation } from "@solidjs/router";
import { MetaProvider } from "@solidjs/meta";
import { FileRoutes } from "@solidjs/start/router";
import type { JSX } from "solid-js";
import { Show, Suspense } from "solid-js";
import { ConfirmProvider } from "~/components/ConfirmProvider";
import { ToastProvider } from "~/components/ToastProvider";
import AppShell from "~/components/AppShell";
import "./app.css";

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password"];

function RootLayout(props: { children: JSX.Element }) {
  const location = useLocation();
  const isPublic = () =>
    PUBLIC_ROUTES.some((r) => location.pathname === r || location.pathname.startsWith(r + "/"));

  return (
    <Show when={!isPublic()} fallback={<Suspense>{props.children}</Suspense>}>
      <AppShell>{props.children}</AppShell>
    </Show>
  );
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RootLayout>{props.children}</RootLayout>
            </ConfirmProvider>
          </ToastProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
