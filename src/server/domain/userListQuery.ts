import "server-only";

import type { Prisma, Role } from "@prisma/client";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db/prisma";
import { getScopedRegionIds } from "./access";

const LIKE_ESCAPE_CHAR = "!";

/** Escape LIKE wildcards so user input is matched literally (`!` is the ESCAPE char). */
export function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`);
}

export type UserListScopeFilters = {
  role?: Role;
  search?: string;
  createdAt?: { gte?: Date; lt?: Date };
};

/**
 * Scoped `where` shared by the user list page and its export. Deleted users
 * are never listed; an ADMIN only sees USER accounts assigned to their
 * regions, and only SUPERADMIN can filter by role. `null` means a search
 * matched nobody, so callers can skip the query entirely.
 */
export async function buildUserListWhere(
  session: SessionUser,
  filters: UserListScopeFilters = {},
): Promise<Prisma.UserWhereInput | null> {
  const scopedRegionIds = await getScopedRegionIds(session);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(session.role === "ADMIN"
      ? { role: "USER", assignedRegions: { some: { regionId: { in: scopedRegionIds ?? [] } } } }
      : {}),
  };
  if (filters.role && session.role === "SUPERADMIN") where.role = filters.role;
  if (filters.createdAt) where.createdAt = filters.createdAt;
  if (filters.search) {
    const term = `%${escapeLikePattern(filters.search)}%`;
    const matchingIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM \`user\` u
      LEFT JOIN user_detail p ON p.user_id = u.id
      WHERE (u.name LIKE ${term} ESCAPE '!'
         OR u.email LIKE ${term} ESCAPE '!'
         OR p.whatsapp LIKE ${term} ESCAPE '!')
        AND u.deleted_at IS NULL
    `;
    if (matchingIds.length === 0) return null;
    where.id = { in: matchingIds.map((row) => row.id) };
  }
  return where;
}
