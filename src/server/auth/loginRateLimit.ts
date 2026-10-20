import "server-only";
import { prisma } from "../db/prisma";
import { hashIdentifier } from "./security";

const MAX_ATTEMPTS = 5;
const IDLE_RESET_MS = 15 * 60_000;
const COOLDOWN_LADDER_MS = [5, 10, 15, 20, 25, 30].map((minutes) => minutes * 60_000);
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;
const MAX_LOCK_KEYS = 10_000;

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

type PersistentThrottleRow = {
  failures: number | bigint;
  level: number | bigint;
  cooldown_until: Date | string | null;
  last_event_at: Date | string;
};

/** Used when the database is temporarily unavailable. Single-instance only. */
const memoryBuckets = new Map<string, Bucket>();

/**
 * Per-key promise tails used to serialize login attempts inside this process.
 * The row lock in `reserveLoginAttempt` serializes the reservation/increment
 * across instances; this promise tail is still only per process. Entries are
 * removed when their last holder releases.
 */
const lockTails = new Map<string, Promise<void>>();

/** Number of holders (current or queued) waiting on each key's promise tail. */
const lockPendings = new Map<string, number>();

/**
 * Serialize attempts for the given throttle keys (in sorted order to avoid
 * lock-order inversions) within this process. Callers should cover the whole
 * reserve/verify sequence so concurrent requests cannot race the throttle.
 */
export async function withLoginThrottleLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const orderedKeys = [...new Set(keys.filter(Boolean))].sort();
  const releases: Array<() => void> = [];

  try {
    for (const key of orderedKeys) {
      const previous = lockTails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(() => current);
      lockTails.set(key, tail);
      lockPendings.set(key, (lockPendings.get(key) ?? 0) + 1);
      releases.push(() => {
        release();
        const pending = (lockPendings.get(key) ?? 1) - 1;
        if (pending <= 0) lockPendings.delete(key);
        else lockPendings.set(key, pending);
        if (lockTails.get(key) === tail) lockTails.delete(key);
      });
      await previous;
    }

    // Defensive soft cap under extreme unique-key churn. Never evict a key with
    // active holders: dropping its tail would let concurrent attempts race the
    // throttle. If every key is busy the map is left above the cap.
    if (lockTails.size > MAX_LOCK_KEYS) {
      for (const key of lockTails.keys()) {
        if (lockTails.size <= MAX_LOCK_KEYS) break;
        if ((lockPendings.get(key) ?? 0) > 0) continue;
        lockTails.delete(key);
        lockPendings.delete(key);
      }
    }
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }

  try {
    return await fn();
  } finally {
    for (const release of releases.reverse()) release();
  }
}

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

/**
 * Apply one failed attempt to a bucket. Shared by the DB and memory paths.
 *
 * While a cooldown is active the same bucket reference is returned untouched:
 * blocked attempts must not extend the cooldown, advance the ladder, or update
 * `lastEventAt`, so an attacker cannot keep a targeted account locked out
 * indefinitely. Otherwise a new (advanced) bucket is returned, which callers can
 * detect with `next === current` to skip a needless write.
 */
function advanceBucket(bucket: Bucket, now: number): Bucket {
  if (bucket.cooldownUntil > now) return bucket;

  const next: Bucket = { ...bucket };
  resetWhenIdle(next, now);
  next.failures += 1;
  next.lastEventAt = now;

  if (next.failures >= MAX_ATTEMPTS) {
    const cooldownMs = COOLDOWN_LADDER_MS[Math.min(next.level, COOLDOWN_LADDER_MS.length - 1)];
    next.cooldownUntil = now + cooldownMs;
    next.level = Math.min(next.level + 1, COOLDOWN_LADDER_MS.length - 1);
    next.failures = 0;
  }

  return next;
}

function timestampOf(value: Date | string | null): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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

/**
 * Atomically reserve one login attempt for `key` and return the post-reservation
 * state. This runs before the password is verified, so every attempt consumes a
 * slot; a successful login must call `clearLoginThrottle` afterwards.
 *
 * The transaction inserts the row if needed, locks it (`SELECT ... FOR UPDATE`)
 * and persists the advanced bucket, which serializes the increment across
 * instances. An active cooldown is not extended by further attempts: the
 * reserved bucket is returned as-is without a write. If the database is
 * unavailable the per-process memory bucket is used instead.
 */
export async function reserveLoginAttempt(key: string): Promise<Throttle> {
  const now = Date.now();
  const nowDate = new Date(now);

  try {
    const bucket = await prisma.$transaction(async (tx) => {
      // 1. Ensure the row exists without overwriting a concurrent writer.
      await tx.$executeRaw`
        INSERT IGNORE INTO \`login_throttle\`
          (\`key\`, \`failures\`, \`level\`, \`cooldown_until\`, \`last_event_at\`, \`updated_at\`)
        VALUES (${key}, 0, 0, NULL, ${nowDate}, ${nowDate})
      `;

      // 2. Lock the row so the read/modify/write below is atomic across instances.
      const rows = await tx.$queryRaw<PersistentThrottleRow[]>`
        SELECT failures, level, cooldown_until, last_event_at
        FROM \`login_throttle\`
        WHERE \`key\` = ${key}
        FOR UPDATE
      `;
      const row = rows[0];
      const current: Bucket = row
        ? {
            failures: Number(row.failures),
            level: Number(row.level),
            cooldownUntil: timestampOf(row.cooldown_until),
            lastEventAt: timestampOf(row.last_event_at) || now,
          }
        : { failures: 0, level: 0, cooldownUntil: 0, lastEventAt: now };

      // 3. Compute the next bucket in TypeScript (same ladder/idle semantics).
      // `advanceBucket` returns the same object when a cooldown is active, so
      // blocked attempts never rewrite (or extend) the row.
      const next = advanceBucket(current, now);
      if (next === current) return next;

      // 4. Persist.
      await tx.loginThrottle.update({
        where: { key },
        data: {
          failures: next.failures,
          level: next.level,
          cooldownUntil: next.cooldownUntil ? new Date(next.cooldownUntil) : null,
          lastEventAt: new Date(next.lastEventAt),
        },
      });

      return next;
    });

    if (Math.random() < 0.01) {
      await prisma.loginThrottle
        .deleteMany({ where: { lastEventAt: { lt: new Date(now - PRUNE_AFTER_MS) } } })
        .catch(() => undefined);
    }
    return responseForBucket(bucket, now);
  } catch {
    // Persistent storage failed: keep the in-memory bucket working locally.
    const current =
      readMemoryBucket(key) ?? ({ failures: 0, level: 0, cooldownUntil: 0, lastEventAt: now } satisfies Bucket);
    // Mirror the persistent path: an active cooldown is never extended.
    const next = current.cooldownUntil > now ? current : advanceBucket(current, now);
    if (next !== current) writeMemoryBucket(key, next);
    return responseForBucket(next, now);
  }
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
