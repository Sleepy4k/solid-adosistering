import "server-only";
import { prisma } from "./db/prisma";
import { hashIdentifier } from "./security";

const MAX_ATTEMPTS = 5;
const IDLE_RESET_MS = 15 * 60_000;
const COOLDOWN_LADDER_MS = [5, 10, 15, 20, 25, 30].map((minutes) => minutes * 60_000);
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;

export type Throttle = {
  blocked: boolean;
  retryAfterSec: number;
  remaining: number;
};

type Bucket = {
  failures: number;
  level: number;
  cooldownUntil: number;
  lastEventAt: number;
};

/** Used when the database is temporarily unavailable. Single-instance only. */
const memoryBuckets = new Map<string, Bucket>();

export function throttleKey(kind: "email" | "ip" | "action", value: string): string {
  return `${kind}:${hashIdentifier(value)}`;
}

function referencePoint(bucket: Bucket): number {
  return bucket.cooldownUntil > 0 ? bucket.cooldownUntil : bucket.lastEventAt;
}

function resetWhenIdle(bucket: Bucket, now: number): boolean {
  if (bucket.cooldownUntil > now) return false;
  if (now - referencePoint(bucket) > IDLE_RESET_MS) {
    bucket.failures = 0;
    bucket.level = 0;
    bucket.cooldownUntil = 0;
    return true;
  }
  return false;
}

function responseForBucket(bucket: Bucket | null, now: number): Throttle {
  if (!bucket) return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS };
  if (bucket.cooldownUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((bucket.cooldownUntil - now) / 1000), remaining: 0 };
  }
  if (bucket.failures === 0 && bucket.level === 0 && bucket.cooldownUntil === 0) {
    return { blocked: false, retryAfterSec: 0, remaining: MAX_ATTEMPTS };
  }
  return { blocked: false, retryAfterSec: 0, remaining: Math.max(0, MAX_ATTEMPTS - bucket.failures) };
}

async function readPersistentBucket(key: string): Promise<Bucket | null | undefined> {
  try {
    const row = await prisma.loginThrottle.findUnique({ where: { key } });
    if (!row) return null;
    return {
      failures: row.failures,
      level: row.level,
      cooldownUntil: row.cooldownUntil?.getTime() ?? 0,
      lastEventAt: row.lastEventAt.getTime(),
    };
  } catch {
    return undefined;
  }
}

function readMemoryBucket(key: string): Bucket | null {
  const bucket = memoryBuckets.get(key);
  return bucket ? { ...bucket } : null;
}

function writeMemoryBucket(key: string, bucket: Bucket) {
  memoryBuckets.set(key, bucket);
  if (memoryBuckets.size > 10_000) {
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    for (const [bucketKey, value] of memoryBuckets) {
      if (value.lastEventAt < cutoff) memoryBuckets.delete(bucketKey);
    }
  }
}

export async function checkLoginThrottle(key: string): Promise<Throttle> {
  const now = Date.now();
  const persistent = await readPersistentBucket(key);
  const bucket = persistent === undefined ? readMemoryBucket(key) : persistent;

  if (!bucket) return responseForBucket(null, now);
  if (resetWhenIdle(bucket, now)) {
    if (persistent === undefined) memoryBuckets.delete(key);
    else await prisma.loginThrottle.deleteMany({ where: { key } }).catch(() => undefined);
    return responseForBucket(null, now);
  }
  return responseForBucket(bucket, now);
}

export async function registerLoginFailure(key: string): Promise<Throttle> {
  const now = Date.now();
  const persistent = await readPersistentBucket(key);
  const bucket =
    (persistent === undefined ? readMemoryBucket(key) : persistent) ??
    ({ failures: 0, level: 0, cooldownUntil: 0, lastEventAt: now } satisfies Bucket);

  resetWhenIdle(bucket, now);
  bucket.failures += 1;
  bucket.lastEventAt = now;

  if (bucket.failures >= MAX_ATTEMPTS) {
    const cooldownMs = COOLDOWN_LADDER_MS[Math.min(bucket.level, COOLDOWN_LADDER_MS.length - 1)];
    bucket.cooldownUntil = now + cooldownMs;
    bucket.level = Math.min(bucket.level + 1, COOLDOWN_LADDER_MS.length - 1);
    bucket.failures = 0;
  }

  if (persistent === undefined) {
    writeMemoryBucket(key, bucket);
  } else {
    try {
      await prisma.loginThrottle.upsert({
        where: { key },
        create: {
          key,
          failures: bucket.failures,
          level: bucket.level,
          cooldownUntil: bucket.cooldownUntil ? new Date(bucket.cooldownUntil) : null,
          lastEventAt: new Date(bucket.lastEventAt),
        },
        update: {
          failures: bucket.failures,
          level: bucket.level,
          cooldownUntil: bucket.cooldownUntil ? new Date(bucket.cooldownUntil) : null,
          lastEventAt: new Date(bucket.lastEventAt),
        },
      });
      if (Math.random() < 0.01) {
        await prisma.loginThrottle
          .deleteMany({ where: { lastEventAt: { lt: new Date(now - PRUNE_AFTER_MS) } } })
          .catch(() => undefined);
      }
    } catch {
      writeMemoryBucket(key, bucket);
    }
  }

  return responseForBucket(bucket, now);
}

export async function clearLoginThrottle(key: string): Promise<void> {
  memoryBuckets.delete(key);
  try {
    await prisma.loginThrottle.deleteMany({ where: { key } });
  } catch {
    // Best-effort: a stale throttle only causes a short cooldown, never a bypass.
  }
}

export function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0 && rest > 0) return `${minutes} menit ${rest} detik`;
  if (minutes > 0) return `${minutes} menit`;
  return `${rest} detik`;
}
