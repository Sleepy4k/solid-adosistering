/**
 * Shared admission control for the memory-heavy export renderers.
 *
 * One active build bounds peak RSS (PDF ~320–360 MB; XLSX streams rows to a
 * compressed archive and measured ~20 MB incremental peak on Node 25 and
 * ~70 MB on Bun 1.3 at the 5,000-row cap). A short FIFO queue absorbs bursty
 * downloads; anything beyond it is rejected with a cheap 503 so expensive
 * count/read/render work never piles up.
 *
 * This module intentionally has no `server-only` marker so it can be exercised
 * in isolation. It holds no secrets and no per-request data.
 */

export const HEAVY_EXPORT_CONCURRENCY = 1;
export const HEAVY_EXPORT_QUEUE_LIMIT = 4;

export const HEAVY_EXPORT_BUSY_MESSAGE = "Server sedang membuat ekspor lain. Coba lagi dalam beberapa detik.";

type HeavyExportWaiter = {
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  onAbort?: () => void;
  settled: boolean;
};

let activeHeavyExports = 0;
const heavyExportQueue: HeavyExportWaiter[] = [];

/**
 * Yield a macrotask so the HTTP server can flush responses and process new
 * connections while a large export is being rendered.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Build an abort error without relying on `DOMException`, which is not present
 * in every supported runtime. The name is what callers match on.
 */
export function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason as unknown;
  const message =
    reason instanceof Error && reason.message
      ? reason.message
      : typeof reason === "string" && reason.length > 0
        ? reason
        : "Ekspor dibatalkan.";

  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Throw an `AbortError` as soon as the caller's signal is aborted. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

/** Recognise both the local abort error and a runtime `DOMException`. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) return error.name === "AbortError";
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}

/** Cheap pre-flight gate: true when no further waiter would fit. */
export function isHeavyExportQueueFull(): boolean {
  return heavyExportQueue.length >= HEAVY_EXPORT_QUEUE_LIMIT;
}

/** Idempotent token so a double `finally` can never free two slots. */
function createHeavyExportRelease(): () => void {
  let released = false;

  return () => {
    if (released) return;
    released = true;
    releaseHeavyExportSlot();
  };
}

function releaseHeavyExportSlot(): void {
  // Hand the slot straight to the next live waiter; `activeHeavyExports`
  // stays unchanged because ownership is transferred, not dropped.
  while (heavyExportQueue.length > 0) {
    const next = heavyExportQueue.shift();
    if (!next || next.settled) continue;

    next.settled = true;
    if (next.signal && next.onAbort) {
      next.signal.removeEventListener("abort", next.onAbort);
    }
    next.resolve(createHeavyExportRelease());
    return;
  }

  activeHeavyExports = Math.max(activeHeavyExports - 1, 0);
}

function createHeavyExportWaiter(signal?: AbortSignal): {
  readonly promise: Promise<() => void>;
  readonly waiter: HeavyExportWaiter;
} {
  let resolveSlot!: (release: () => void) => void;
  let rejectSlot!: (error: Error) => void;

  const promise = new Promise<() => void>((resolve, reject) => {
    resolveSlot = resolve;
    rejectSlot = reject;
  });

  return {
    promise,
    waiter: {
      resolve: resolveSlot,
      reject: rejectSlot,
      ...(signal ? { signal } : {}),
      settled: false,
    },
  };
}

function rejectedAbortPromise(signal: AbortSignal): Promise<() => void> {
  const promise = Promise.reject<() => void>(abortError(signal));
  // An already-aborted request may never be awaited again; keep that expected
  // rejection from surfacing as an unhandled rejection.
  void promise.catch(() => {});
  return promise;
}

/**
 * Reserve a heavy-export slot.
 *
 * - A free slot resolves immediately with an idempotent release token.
 * - A full renderer with queue space waits abortably, in FIFO order.
 * - `null` is returned synchronously when both the renderer and queue are
 *   full; callers must not hold or release anything in that case.
 * - An already-aborted signal returns a rejected promise.
 */
export function acquireHeavyExportSlot(signal?: AbortSignal): Promise<() => void> | null {
  if (signal?.aborted) return rejectedAbortPromise(signal);

  if (activeHeavyExports < HEAVY_EXPORT_CONCURRENCY) {
    activeHeavyExports += 1;
    return Promise.resolve(createHeavyExportRelease());
  }

  if (heavyExportQueue.length >= HEAVY_EXPORT_QUEUE_LIMIT) return null;

  const { promise, waiter } = createHeavyExportWaiter(signal);

  if (signal) {
    const onAbort = () => {
      // A granted waiter owns a release token; aborting the request afterwards
      // must not release that slot a second time.
      if (waiter.settled) return;
      waiter.settled = true;

      const index = heavyExportQueue.indexOf(waiter);
      if (index !== -1) heavyExportQueue.splice(index, 1);
      signal.removeEventListener("abort", onAbort);
      waiter.reject(abortError(signal));
    };

    waiter.onAbort = onAbort;
    signal.addEventListener("abort", onAbort, { once: true });
  }

  heavyExportQueue.push(waiter);

  // Covers a signal aborted between the initial check and listener attachment.
  if (signal?.aborted) waiter.onAbort?.();

  // The caller may stop awaiting when its request disappears; the abort must
  // still leave the queue without producing an unhandled rejection.
  void promise.catch(() => {});

  return promise;
}
