/**
 * Cache key and TTL registry for the process-local server cache.
 *
 * Keys are versioned (`v1:`) so a future value-shape change can be rolled out
 * by bumping the prefix instead of debugging stale entries. All keys here are
 * public, non-user-scoped reads. Never add session/auth/user-scoped data to
 * this namespace.
 *
 * This module has no `server-only` import so it can be imported by tests.
 */

export const CACHE_KEY_VERSION = "v1";
export const PUBLIC_CACHE_PREFIX = `${CACHE_KEY_VERSION}:pub:`;

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
