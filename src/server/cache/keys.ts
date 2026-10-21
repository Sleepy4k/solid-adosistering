/**
 * Cache key and TTL registry for the process-local server cache.
 *
 * Keys are versioned (`v1:`) so a future value-shape change can be rolled out
 * by bumping the prefix instead of debugging stale entries. All keys here are
 * public, non-user-scoped reads. Never add session/auth/user-scoped data to
 * this namespace.
 *
 * Cross-instance invalidation is signalled through the `publicCacheVersion` row
 * in `system_setting`: each replica re-reads it in the background at most once
 * per check interval and drops its public entries when the value changes, so an
 * authoritative write on another replica becomes visible within ~12s. Public
 * reads never wait on that check. The five-minute TTL remains the hard fallback
 * when the row cannot be read, is missing, the query hangs, or a replica never
 * observes the change.
 *
 * `SERVER_CACHE_DISABLED=true` disables local reads and entries, but version
 * writes still publish so cache-enabled replicas are still notified.
 *
 * This module has no `server-only` import so it can be imported by tests.
 */

export const CACHE_KEY_VERSION = "v1";
export const PUBLIC_CACHE_PREFIX = `${CACHE_KEY_VERSION}:pub:`;

/**
 * `system_setting` key holding a JSON string version token (a UUID). It is
 * rewritten after every authoritative public write and is never cached. A
 * missing row is normalized to "no version yet".
 */
export const PUBLIC_CACHE_VERSION_KEY = "publicCacheVersion";

/**
 * Per-process budget for background version-row reads. This bounds
 * cross-instance staleness to roughly this interval, at the cost of one tiny
 * indexed read per interval for the whole process. The check is never awaited
 * by a public read, so a slow query only delays invalidation; the TTL still
 * bounds staleness.
 */
export const PUBLIC_CACHE_VERSION_CHECK_INTERVAL_MS = 12_000;

/** Public configuration changes rarely; five minutes bounds staleness. */
export const WEB_CONFIG_TTL_MS = 5 * 60_000;

/** Public landing lists are edited rarely and read on every landing page hit. */
export const LANDING_TTL_MS = 5 * 60_000;

export const LANDING_CACHE_PREFIX = `${PUBLIC_CACHE_PREFIX}landing:`;

export const LANDING_KINDS = ["testimonials", "locations", "partners"] as const;
export type LandingKind = (typeof LANDING_KINDS)[number];

export const cacheKeys = {
  webConfig: `${PUBLIC_CACHE_PREFIX}web-config`,
  landing: {
    testimonials: `${LANDING_CACHE_PREFIX}testimonials`,
    locations: `${LANDING_CACHE_PREFIX}locations`,
    partners: `${LANDING_CACHE_PREFIX}partners`,
  },
} as const satisfies {
  webConfig: `${typeof PUBLIC_CACHE_PREFIX}${string}`;
  landing: Record<LandingKind, `${typeof LANDING_CACHE_PREFIX}${string}`>;
};

/** Typed key lookup shared by the read actions and invalidation helpers. */
export function landingCacheKey(kind: LandingKind): (typeof cacheKeys.landing)[LandingKind] {
  return cacheKeys.landing[kind];
}
