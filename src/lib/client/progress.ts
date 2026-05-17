import type nProgress from "nprogress";

type ProgressApi = typeof nProgress;

let progressPromise: Promise<ProgressApi> | null = null;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let visibleSince = 0;

const START_DELAY_MS = 50;
const MIN_VISIBLE_MS = 200;

function resolveProgress(module: unknown): ProgressApi {
  const candidate = (module as { default?: unknown }).default ?? module;
  return candidate as ProgressApi;
}

async function loadProgress() {
  if (typeof document === "undefined") return null;
  progressPromise ??= import("nprogress").then((module) => {
    const progress = resolveProgress(module);
    progress.configure({ showSpinner: false, speed: 300, minimum: 0.08 });
    return progress;
  });
  return progressPromise;
}

export async function startProgress(options?: { immediate?: boolean }) {
  if (typeof document === "undefined") return;

  if (options?.immediate) {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    if (visibleSince) return;
    const progress = await loadProgress();
    visibleSince = Date.now();
    progress?.start();
    return;
  }

  if (startTimer || visibleSince) return;

  startTimer = setTimeout(async () => {
    startTimer = null;
    if (visibleSince) return;
    const progress = await loadProgress();
    visibleSince = Date.now();
    progress?.start();
  }, START_DELAY_MS);
}

export async function finishProgress() {
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  const since = visibleSince;
  if (!since) return;
  visibleSince = 0;
  const progress = await loadProgress();
  const elapsed = Date.now() - since;
  const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
  window.setTimeout(() => progress?.done(), delay);
}

export function installNavigationProgress() {
  if (typeof document === "undefined") return () => undefined;

  const onClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;

    const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;

    void startProgress();
  };

  const onPopState = () => void startProgress();

  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", onPopState);

  return () => {
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("popstate", onPopState);
  };
}
