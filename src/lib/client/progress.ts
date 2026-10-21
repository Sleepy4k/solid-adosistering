import type nProgress from "nprogress";

type ProgressApi = typeof nProgress;

let progressPromise: Promise<ProgressApi | null> | null = null;
let progressApi: ProgressApi | null = null;
let nativeRemove: (() => void) | null = null;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let doneTimer: ReturnType<typeof setTimeout> | null = null;
let visibleSince = 0;
let activeStarts = 0;
let token = 0;
let barVisible = false;

const START_DELAY_MS = 50;
const MIN_VISIBLE_MS = 200;

function resolveProgress(module: unknown): ProgressApi {
  const candidate = (module as { default?: unknown }).default ?? module;
  return candidate as ProgressApi;
}

async function loadProgress(): Promise<ProgressApi | null> {
  if (typeof document === "undefined") return null;

  progressPromise ??= import("nprogress")
    .then((module) => {
      const progress = resolveProgress(module);
      progress.configure({ showSpinner: false, speed: 300, minimum: 0.08 });

      // done() schedules its own 300ms fade and remove() for 600ms later.
      // Keep the real remover so an in-flight run can veto a stale remove.
      const remove = progress.remove;
      if (typeof remove === "function") {
        nativeRemove = remove.bind(progress);
        progress.remove = () => {
          if (activeStarts > 0 || barVisible) return;
          nativeRemove?.();
        };
      }

      progressApi = progress;
      return progress;
    })
    .catch(() => {
      // ESM caches a rejected import, so a later navigation can retry the
      // import only where the runtime allows re-evaluating it. Don't cache
      // the failure ourselves; the fallback stays a null API.
      progressPromise = null;
      return null;
    });

  return progressPromise;
}

function detachStaleBar(): void {
  if (nativeRemove === null) return;
  if (typeof document.getElementById !== "function") return;
  if (document.getElementById("nprogress") === null) return;

  // The element may still be owned by a previous run's fade/remove timers.
  nativeRemove();
}

function clearStartTimer() {
  if (startTimer !== null) {
    clearTimeout(startTimer);
    startTimer = null;
  }
}

function clearDoneTimer() {
  if (doneTimer !== null) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
}

async function begin(myToken: number): Promise<void> {
  const progress = await loadProgress();

  // Abort when the run was finished (or replaced) while the import was pending.
  if (progress === null || token !== myToken || activeStarts === 0 || visibleSince !== 0) return;

  visibleSince = Date.now();

  // NProgress is still visible from a previous run; this run inherited it.
  if (barVisible) return;

  // done() leaves #nprogress in the DOM during its fade. start() would reuse
  // that element, so detach it first: start() then creates a fresh element
  // that the previous run's fade/remove timers cannot target.
  detachStaleBar();

  barVisible = true;
  progress.start();
}

export async function startProgress(options?: { immediate?: boolean }): Promise<void> {
  if (typeof document === "undefined") return;

  activeStarts += 1;

  // Only the first outstanding start begins (or continues) the visual run.
  if (activeStarts > 1) return;

  // A delayed done() from a previous run must never hide this run.
  clearDoneTimer();

  const myToken = ++token;
  visibleSince = 0;

  if (options?.immediate) {
    await begin(myToken);
    return;
  }

  clearStartTimer();
  startTimer = setTimeout(() => {
    startTimer = null;
    void begin(myToken);
  }, START_DELAY_MS);
}

export async function finishProgress(): Promise<void> {
  if (typeof document === "undefined") return;

  // AuthLayout and other consumers may call this without a paired start.
  if (activeStarts === 0) return;

  activeStarts -= 1;
  if (activeStarts > 0) return;

  const myToken = ++token;
  clearStartTimer();
  clearDoneTimer();

  if (!barVisible) {
    visibleSince = 0;
    return;
  }

  const since = visibleSince || Date.now();
  visibleSince = 0;
  const delay = Math.max(0, MIN_VISIBLE_MS - (Date.now() - since));

  doneTimer = setTimeout(() => {
    doneTimer = null;
    if (token !== myToken || activeStarts > 0) return;

    barVisible = false;
    progressApi?.done();
  }, delay);
}
