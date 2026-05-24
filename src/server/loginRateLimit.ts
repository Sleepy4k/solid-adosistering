const MAX_ATTEMPTS = 3;
const IDLE_RESET_MS = 15 * 60_000;
const COOLDOWN_LADDER_MS = [5, 10, 15, 20, 25, 30].map((minutes) => minutes * 60_000);

type Bucket = {
  fails: number;
  level: number;
  cooldownUntil: number;
  lastEventAt: number;
};

type Throttle = {
  blocked: boolean;
  retryAfterSec: number;
  remaining: number;
};

const buckets = new Map<string, Bucket>();

function referencePoint(bucket: Bucket): number {
  return bucket.cooldownUntil > 0 ? bucket.cooldownUntil : bucket.lastEventAt;
}

function resetWhenIdle(bucket: Bucket, now: number) {
  if (bucket.cooldownUntil > now) return;
  if (now - referencePoint(bucket) > IDLE_RESET_MS) {
    bucket.fails = 0;
    bucket.level = 0;
    bucket.cooldownUntil = 0;
  }
}

export function checkLoginThrottle(key: string): Throttle {
  const bucket = buckets.get(key);
  if (!bucket) return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS };

  const now = Date.now();
  if (bucket.cooldownUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((bucket.cooldownUntil - now) / 1000), remaining: 0 };
  }

  resetWhenIdle(bucket, now);
  if (bucket.fails === 0 && bucket.level === 0 && bucket.cooldownUntil === 0) {
    buckets.delete(key);
    return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS };
  }
  return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS - bucket.fails };
}

export function registerLoginFailure(key: string): Throttle {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { fails: 0, level: 0, cooldownUntil: 0, lastEventAt: now };
    buckets.set(key, bucket);
  }

  resetWhenIdle(bucket, now);
  bucket.fails += 1;
  bucket.lastEventAt = now;

  if (bucket.fails >= MAX_ATTEMPTS) {
    const cooldownMs = COOLDOWN_LADDER_MS[Math.min(bucket.level, COOLDOWN_LADDER_MS.length - 1)];
    bucket.cooldownUntil = now + cooldownMs;
    bucket.level = Math.min(bucket.level + 1, COOLDOWN_LADDER_MS.length - 1);
    bucket.fails = 0;
    return { blocked: true, retryAfterSec: Math.ceil(cooldownMs / 1000), remaining: 0 };
  }

  return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS - bucket.fails };
}

export function clearLoginThrottle(key: string) {
  buckets.delete(key);
}
