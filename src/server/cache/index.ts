import "server-only";
import { createMemoryCache, type MemoryCache } from "./memoryCache";
import { cacheKeys, LANDING_CACHE_PREFIX, type LandingKind } from "./keys";

/**
 * Shared process-local cache for small, public, high-frequency reads.
 *
 * - One instance per process, kept on `globalThis` in every environment so dev
 *   HMR and Nitro's bundled server modules reuse the same store.
 * - Multi-instance deployments are eventually consistent: another replica's
 *   writes become visible here only after the TTL expires. TTL is the staleness
 *   bound. The current architecture runs a single replica because the pump and
 *   automatic-mode locks are already process-local.
 * - `SERVER_CACHE_DISABLED=true` turns the cache off (read once at startup).
 * - Any cache failure degrades to calling the loader; it never fails a request.
 */
type ServerCacheGlobal = typeof globalThis & {
  __adosisteringServerCache?: MemoryCache;
};

const globalForCache = globalThis as ServerCacheGlobal;

export const serverCache: MemoryCache =
  globalForCache.__adosisteringServerCache ??
  createMemoryCache({
    enabled: process.env.SERVER_CACHE_DISABLED !== "true",
    maxEntries: 200,
    maxValueBytes: 1024 * 1024,
  });

globalForCache.__adosisteringServerCache = serverCache;

/**
 * Call immediately after the authoritative write succeeds and before logging or
 * email side effects, so the next public read sees the new value.
 */
export function invalidateWebConfig(): void {
  serverCache.delete(cacheKeys.webConfig);
}

/**
 * Invalidate one landing list, or every landing list when `kind` is omitted.
 * Use the narrower form from create/update/delete actions.
 */
export function invalidateLanding(kind?: LandingKind): void {
  if (kind) {
    serverCache.delete(cacheKeys.landing[kind]);
    return;
  }
  serverCache.invalidatePrefix(LANDING_CACHE_PREFIX);
}
