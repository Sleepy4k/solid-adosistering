import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { createMemoryCache, type MemoryCache } from "./memoryCache";
import {
  cacheKeys,
  LANDING_CACHE_PREFIX,
  PUBLIC_CACHE_PREFIX,
  PUBLIC_CACHE_VERSION_CHECK_INTERVAL_MS,
  PUBLIC_CACHE_VERSION_KEY,
  type LandingKind,
} from "./keys";

/**
 * Shared process-local cache for small, public, high-frequency reads.
 *
 * - One instance per process, kept on `globalThis` in every environment so dev
 *   HMR and Nitro's bundled server modules reuse the same store.
 * - Cross-instance invalidation is driven by the `publicCacheVersion` row in
 *   `system_setting`. Each public read starts that check in the background and
 *   consults the local cache immediately, so a cache hit never waits on the
 *   database. The row is re-read at most once per
 *   `PUBLIC_CACHE_VERSION_CHECK_INTERVAL_MS` (12s); a changed value evicts this
 *   process's public entries. Writes bump the row after the authoritative write,
 *   so replicas converge within ~12s. The version row is never cached.
 * - The five-minute TTL remains the hard fallback: if the row cannot be read,
 *   or the query never settles, cached values are served until they expire, the
 *   failure is logged at most once per minute, and a settled failure is retried
 *   after the throttle. A version read/write failure never fails a request and
 *   never clears the cache.
 * - `SERVER_CACHE_DISABLED=true` disables local reads and entries (read once at
 *   startup), but invalidations still publish the version so cache-enabled
 *   replicas in a mixed deployment are notified. A disabled process never reads
 *   the version row.
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

/** A persistent DB problem must not flood logs; one warning per minute is enough. */
const PUBLIC_CACHE_VERSION_WARNING_INTERVAL_MS = 60_000;

/** Last version-row read attempt; `0` means this process never attempted one. */
let lastPublicCacheVersionCheckAt = 0;

/**
 * `null` = never successfully checked. `""` = checked, but the row is missing
 * or holds a non-string value, so there is no version to compare against yet.
 */
let lastSeenPublicCacheVersion: string | null = null;

/** Single-flight guard: concurrent public reads share one version query. */
let publicCacheVersionCheckInFlight: Promise<void> | null = null;

/** Warning throttle shared by version reads and writes. */
let lastPublicCacheVersionWarningAt = 0;

/**
 * Log a sanitized warning. The underlying error is deliberately not logged
 * because Prisma errors can embed connection details.
 */
function warnPublicCacheVersionFailure(operation: "read" | "write"): void {
  const now = Date.now();
  if (now - lastPublicCacheVersionWarningAt < PUBLIC_CACHE_VERSION_WARNING_INTERVAL_MS) return;
  lastPublicCacheVersionWarningAt = now;
  console.warn(
    `[cache] public cache version ${operation} failed; serving cached values and retrying after the throttle.`,
  );
}

/**
 * Read the shared version token. Returns only string values; a missing row or a
 * non-string JSON value yields `null`. Read errors propagate so the caller can
 * keep its cached values and retry instead of treating the failure as "missing".
 */
async function readPublicCacheVersion(): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: PUBLIC_CACHE_VERSION_KEY },
    select: { value: true },
  });
  return typeof setting?.value === "string" ? setting.value : null;
}

/**
 * Best-effort background re-check of the shared version token, throttled to
 * once per interval with a single in-flight query. A change evicts this
 * process's public entries, so another replica's write is picked up within
 * ~12s instead of waiting for the TTL. The first successful check also evicts
 * entries that survived dev HMR or a duplicated module while this module's
 * state reset. Never throws, and never clears the cache on a failed read.
 *
 * Callers must not await this on a request path: a slow or hung query only
 * delays invalidation, while cached reads keep being served until the TTL.
 */
async function touchPublicCacheVersion(): Promise<void> {
  if (!serverCache.enabled) return;

  const inFlight = publicCacheVersionCheckInFlight;
  if (inFlight) return inFlight;

  if (Date.now() - lastPublicCacheVersionCheckAt < PUBLIC_CACHE_VERSION_CHECK_INTERVAL_MS) return;

  const check = (async (): Promise<void> => {
    try {
      const version = (await readPublicCacheVersion()) ?? "";
      const previous = lastSeenPublicCacheVersion;
      if (previous === null) {
        // HMR or a duplicated server module can keep the cache singleton while
        // resetting module state, so an existing entry may predate the version
        // we are about to adopt. Drop it once when a real version appears; an
        // empty/missing version has no comparable state and must not evict.
        if (version !== "" && serverCache.stats().size > 0) {
          serverCache.invalidatePrefix(PUBLIC_CACHE_PREFIX);
        }
      } else if (previous !== version) {
        serverCache.invalidatePrefix(PUBLIC_CACHE_PREFIX);
      }
      lastSeenPublicCacheVersion = version;
    } catch {
      // Keep serving cached values. `lastPublicCacheVersionCheckAt` is updated
      // in `finally`, so the next attempt waits for the throttle interval.
      warnPublicCacheVersionFailure("read");
    } finally {
      lastPublicCacheVersionCheckAt = Date.now();
      publicCacheVersionCheckInFlight = null;
    }
  })();

  publicCacheVersionCheckInFlight = check;
  return check;
}

/**
 * Public read that never waits on the version row. The cross-instance check is
 * started in the background (throttled to once per 12s) while the local cache
 * is consulted immediately, so cache hits stay database-free. Until the check
 * observes a new version, the TTL bounds staleness.
 */
export async function getPublicCached<T>(
  key: `${typeof PUBLIC_CACHE_PREFIX}${string}`,
  loader: () => T | Promise<T>,
  ttlMs: number,
): Promise<T> {
  // `touchPublicCacheVersion` catches every failure, so discarding the promise
  // cannot produce an unhandled rejection and a hung query never blocks reads.
  void touchPublicCacheVersion();
  return serverCache.getOrSet(key, loader, ttlMs);
}

/**
 * Publish an invalidation to other replicas by replacing the version token.
 * This still runs when the local cache is disabled so a mixed deployment
 * (`SERVER_CACHE_DISABLED=true` on one replica) notifies cache-enabled
 * replicas; only local reads and entries are disabled. Returns false when the
 * write failed; never throws, so a version-row problem cannot roll back or fail
 * an already-committed write.
 */
async function bumpPublicCacheVersion(): Promise<boolean> {
  const version = randomUUID();
  try {
    await prisma.systemSetting.upsert({
      where: { key: PUBLIC_CACHE_VERSION_KEY },
      create: { key: PUBLIC_CACHE_VERSION_KEY, value: version },
      update: { value: version },
    });
    lastSeenPublicCacheVersion = version;
    lastPublicCacheVersionCheckAt = Date.now();
    return true;
  } catch {
    warnPublicCacheVersionFailure("write");
    return false;
  }
}

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

/** Drop the local web config entry, then publish the change to other replicas. */
export async function invalidateWebConfigAndPublish(): Promise<void> {
  invalidateWebConfig();
  await bumpPublicCacheVersion();
}

/** Drop the local landing list(s), then publish the change to other replicas. */
export async function invalidateLandingAndPublish(kind?: LandingKind): Promise<void> {
  invalidateLanding(kind);
  await bumpPublicCacheVersion();
}
