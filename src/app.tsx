import { Router, useLocation } from "@solidjs/router";
import { MetaProvider } from "@solidjs/meta";
import { FileRoutes } from "@solidjs/start/router";
import type { JSX } from "solid-js";
import { ErrorBoundary, Show, Suspense } from "solid-js";
import { AppErrorFallback } from "~/components/shared/AppErrorBoundary";
import { ConfirmProvider } from "~/components/shared/ConfirmProvider";
import { DefaultMeta } from "~/components/shared/DefaultMeta";
import { PageSkeleton } from "~/components/shared/PageSkeleton";
import RouterProgress from "~/components/shared/RouterProgress";
import { ToastProvider } from "~/components/shared/ToastProvider";
import { PROTECTED_ROUTE_PREFIXES } from "~/constants/routes";
import AppShell from "~/layouts/AppLayout";
import "./app.css";

function RootLayout(props: { children: JSX.Element }) {
  const location = useLocation();

  const isProtected = () =>
    PROTECTED_ROUTE_PREFIXES.some((route) => location.pathname === route || location.pathname.startsWith(route + "/"));

  return (
    <>
      <RouterProgress />
      <Show
        when={isProtected()}
        fallback={
          <ErrorBoundary fallback={(error, reset) => <AppErrorFallback error={error} reset={reset} />}>
            <Suspense fallback={<PageSkeleton />}>{props.children}</Suspense>
          </ErrorBoundary>
        }
      >
        <AppShell>
          <ErrorBoundary fallback={(error, reset) => <AppErrorFallback error={error} reset={reset} />}>
            {props.children}
          </ErrorBoundary>
        </AppShell>
      </Show>
    </>
  );
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <DefaultMeta />
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
