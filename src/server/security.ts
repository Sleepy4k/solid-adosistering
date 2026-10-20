import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { Role } from "~/lib/shared/irrigation";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * OWASP Password Storage Cheat Sheet baseline for Argon2id:
 * m=19 MiB, t=2, p=1. Parameters are encoded in the hash, so they can be
 * raised later without breaking existing passwords (see needsPasswordRehash).
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const roleRank: Record<Role, number> = {
  USER: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

export function requireRole(user: SessionUser | null | undefined, minimumRole: Role): SessionUser {
  if (!user || roleRank[user.role] < roleRank[minimumRole]) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export function assertSuperadmin(user: SessionUser | null | undefined): SessionUser {
  return requireRole(user, "SUPERADMIN");
}

export function assertAdminOrHigher(user: SessionUser | null | undefined): SessionUser {
  return requireRole(user, "ADMIN");
}

export function hasRole(role: Role, minimum: Role): boolean {
  return roleRank[role] >= roleRank[minimum];
}

/** Stable, non-reversible identifier for throttling without storing raw emails/IPs. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(storedHash: string): boolean {
  try {
    return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/** Only allow same-origin relative redirects or explicitly allowed origins. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value) return fallback;
  if (/[\\\r\n]/.test(value)) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return fallback;
}

/**
 * CMS-supplied URLs are rendered in <img src>. Restrict them to HTTPS,
 * HTTP (dev), or root-relative paths so `javascript:`/`data:` payloads
 * can never reach the browser.
 */
export function isSafeImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (/[\\\r\n]/.test(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isSafeImageUrl(trimmed) && trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return isSafeImageUrl(trimmed) ? trimmed : null;
}
