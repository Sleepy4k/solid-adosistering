import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Role } from "~/lib/shared/irrigation";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const roleRank: Record<Role, number> = {
  USER: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

export function requireRole(user: SessionUser | null | undefined, minimumRole: Role) {
  if (!user || roleRank[user.role] < roleRank[minimumRole]) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export function assertSuperadmin(user: SessionUser | null | undefined) {
  return requireRole(user, "SUPERADMIN");
}

export function assertAdminOrHigher(user: SessionUser | null | undefined) {
  return requireRole(user, "ADMIN");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}
