/**
 * Process-local, bounded memory cache for small, public, high-frequency reads.
 *
 * Consistency model:
 * - The cache lives in a single Node/Bun process. It is NOT shared between
 *   instances, so it is eventually consistent across a multi-instance
 *   deployment. TTL is the staleness bound for values written by another
 *   process; mutations handled by this process invalidate eagerly.
 * - The current architecture intentionally runs one replica (the process-local
 *   pump/automatic-mode locks already require that), so no cross-process
 *   invalidation bus is needed.
 * - Set `SERVER_CACHE_DISABLED=true` to disable caching. The flag is read once
 *   when the singleton is created, so changing it requires a restart.
 *
 * This module is intentionally free of the `server-only` import so the cache
 * can be unit-tested in isolation. The singleton and invalidation helpers live
 * in `./index.ts`.
 */

export type MemoryCacheOptions = {
  /** Hard cap on stored entries. Eviction follows Map insertion order (LRU-ish). */
  maxEntries?: number;
  /** Hard cap on the serialized UTF-8 size of a cached value. */
  maxValueBytes?: number;
  /** Injectable clock in milliseconds, used by tests. Defaults to `Date.now`. */
  clock?: () => number;
  /** Kill switch. When false, reads always miss and writes are ignored. */
  enabled?: boolean;
};

export type MemoryCacheStats = Readonly<{
  enabled: boolean;
  size: number;
  inflight: number;
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  expirations: number;
  rejected: number;
  staleWriteSkips: number;
}>;

export type MemoryCache = {
  readonly enabled: boolean;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  /**
   * Return the cached value, or run `loader` once and cache its result.
   * Concurrent callers for the same key share one in-flight load.
   * Loader errors are propagated and never cached.
   */
  getOrSet<T>(key: string, loader: () => T | Promise<T>, ttlMs: number): Promise<T>;
  delete(key: string): void;
  /** Evict every key starting with `prefix`. Returns the number of entries removed. */
  invalidatePrefix(prefix: string): number;
  clear(): void;
  stats(): MemoryCacheStats;
};

type Entry = {
  value: unknown;
  expiresAt: number;
};

type Inflight = {
  promise: Promise<unknown>;
};

/**
 * `__proto__`, `constructor`, and `prototype` are rejected as own data keys so
 * a cached value can never be used to pollute prototypes downstream.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const textEncoder = new TextEncoder();

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate that `value` is plain JSON-compatible data (no Date, Decimal, Map,
 * Set, Response, Promise, function, bigint, symbol, NaN, undefined, class
 * instance, accessor, sparse array, or cycle), enforce the size cap, and
 * deep-freeze all contained objects/arrays.
 *
 * Rejected values are simply not cached; the caller still receives the loaded
 * value.
 */
function prepareValue(value: unknown, maxValueBytes: number): boolean {
  const ancestors = new Set<object>();
  const nodes = new Set<object>();

  const visit = (node: unknown): boolean => {
    if (node === null) return true;
    if (typeof node === "string" || typeof node === "boolean") return true;
    if (typeof node === "number") return Number.isFinite(node);
    if (typeof node !== "object") return false;
    if (ancestors.has(node)) return false;

    if (Array.isArray(node)) {
      ancestors.add(node);
      for (let index = 0; index < node.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(node, index);
        if (!descriptor || !("value" in descriptor) || !visit(descriptor.value)) {
          ancestors.delete(node);
          return false;
        }
      }
      ancestors.delete(node);
      nodes.add(node);
      return true;
    }

    if (!isPlainRecord(node)) return false;

    ancestors.add(node);
    for (const key of Object.keys(node)) {
      if (FORBIDDEN_KEYS.has(key)) {
        ancestors.delete(node);
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      if (!descriptor || !("value" in descriptor) || !visit(descriptor.value)) {
        ancestors.delete(node);
        return false;
      }
    }
    if (Object.getOwnPropertySymbols(node).length > 0) {
      ancestors.delete(node);
      return false;
    }
    ancestors.delete(node);
    nodes.add(node);
    return true;
  };

  if (!visit(value)) return false;

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string" || textEncoder.encode(serialized).byteLength > maxValueBytes) {
      return false;
    }
    // Server functions serialize the value before sending it to the client, so
    // freezing the shared server-side reference is safe and prevents accidental
    // mutation between requests.
    for (const node of nodes) Object.freeze(node);
    return true;
  } catch {
    return false;
  }
}

export function createMemoryCache(options: MemoryCacheOptions = {}): MemoryCache {
  const requestedMaxEntries = options.maxEntries ?? 200;
  const requestedMaxValueBytes = options.maxValueBytes ?? 1024 * 1024;
  const maxEntries = Number.isFinite(requestedMaxEntries) ? Math.max(1, Math.floor(requestedMaxEntries)) : 200;
  const maxValueBytes = Number.isFinite(requestedMaxValueBytes)
    ? Math.max(1, Math.floor(requestedMaxValueBytes))
    : 1024 * 1024;
  const clock = options.clock ?? (() => Date.now());
  const enabled = options.enabled ?? true;

  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Inflight>();

  /**
   * Conservative invalidation epoch. Any delete/prefix-invalidate/clear bumps
   * it, so an in-flight loader that started before the invalidation cannot
   * write its stale value back into the cache. This may skip an unrelated
   * write when invalidations run concurrently with loads (invalidation is
   * rare), which only costs one extra load and never serves stale data.
   */
  let epoch = 0;

  const counters = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    expirations: 0,
    rejected: 0,
    staleWriteSkips: 0,
  };

  function get<T>(key: string): T | undefined {
    if (!enabled) return undefined;
    try {
      const entry = entries.get(key);
      if (!entry) {
        counters.misses += 1;
        return undefined;
      }
      if (entry.expiresAt <= clock()) {
        entries.delete(key);
        counters.expirations += 1;
        counters.misses += 1;
        return undefined;
      }
      // LRU-ish: re-insert on hit so Map insertion order tracks recency.
      entries.delete(key);
      entries.set(key, entry);
      counters.hits += 1;
      return entry.value as T;
    } catch {
      // Cache failures must never break the request.
      return undefined;
    }
  }

  function set<T>(key: string, value: T, ttlMs: number): void {
    if (!enabled) return;
    try {
      if (typeof key !== "string" || key.length === 0) return;
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
      if (!prepareValue(value, maxValueBytes)) {
        counters.rejected += 1;
        return;
      }
      const now = clock();
      if (!Number.isFinite(now)) return;

      // Delete first so an update also refreshes the insertion-order position.
      entries.delete(key);
      entries.set(key, { value, expiresAt: now + ttlMs });
      counters.sets += 1;

      if (entries.size > maxEntries) {
        for (const [existingKey, existing] of entries) {
          if (entries.size <= maxEntries) break;
          if (existing.expiresAt <= now) {
            entries.delete(existingKey);
            counters.expirations += 1;
          }
        }
      }
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
        counters.evictions += 1;
      }
    } catch {
      // Cache failures must never break the request.
    }
  }

  async function getOrSet<T>(key: string, loader: () => T | Promise<T>, ttlMs: number): Promise<T> {
    if (!enabled) return loader();

    const cached = get<T>(key);
    if (cached !== undefined) return cached;

    const pending = inflight.get(key);
    if (pending) return pending.promise as Promise<T>;

    const startEpoch = epoch;
    // Ordering matters: `loader` may throw synchronously before its first
    // `await`, so the async body's `finally` can run in this same tick. The
    // entry must be registered BEFORE the loader is invoked, otherwise the
    // identity check in `finally` misses and the rejected promise stays in
    // `inflight` forever, replaying the failure instead of retrying. The
    // promise is created up front (and settled below) so concurrent callers
    // always share the real load rather than a placeholder.
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const entry: Inflight = { promise };
    inflight.set(key, entry);

    void (async (): Promise<void> => {
      try {
        const value = await loader();
        if (epoch === startEpoch) {
          set(key, value, ttlMs);
        } else {
          counters.staleWriteSkips += 1;
        }
        resolve(value);
      } catch (error) {
        reject(error);
      } finally {
        // The identity check prevents an old, invalidated load from
        // unregistering a newer load for the same key.
        if (inflight.get(key) === entry) inflight.delete(key);
      }
    })();

    return promise;
  }

  function remove(key: string): void {
    epoch += 1;
    entries.delete(key);
    // Detach an in-flight load: callers already awaiting it keep their result,
    // but requests arriving after the invalidation must start a fresh load.
    inflight.delete(key);
  }

  function invalidatePrefix(prefix: string): number {
    // Bump even when nothing is currently cached: a matching load may still be
    // in flight and must not write its pre-invalidation result back.
    epoch += 1;
    if (typeof prefix !== "string" || prefix.length === 0) return 0;

    let removed = 0;
    for (const key of entries.keys()) {
      if (key.startsWith(prefix)) {
        entries.delete(key);
        removed += 1;
      }
    }
    for (const key of inflight.keys()) {
      if (key.startsWith(prefix)) inflight.delete(key);
    }
    return removed;
  }

  function clear(): void {
    epoch += 1;
    entries.clear();
    inflight.clear();
  }

  function stats(): MemoryCacheStats {
    return {
      enabled,
      size: entries.size,
      inflight: inflight.size,
      ...counters,
    };
  }

  return {
    enabled,
    get,
    set,
    getOrSet,
    delete: remove,
    invalidatePrefix,
    clear,
    stats,
  };
}
