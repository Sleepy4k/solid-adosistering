import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

/**
 * Small fixed-window limiter for public, unauthenticated actions.
 * Login uses the persistent throttle table instead, because it must work
 * across replicas and survive restarts.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSec: 0 };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(`Terlalu banyak permintaan. Coba lagi dalam ${result.retryAfterSec} detik.`, {
    status: 429,
    headers: { "Retry-After": String(result.retryAfterSec), "Cache-Control": "no-store" },
  });
}
