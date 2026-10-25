import "server-only";

import type { Prisma, Role } from "@prisma/client";
import type { SessionUser } from "../auth/session";
import { getScopedRegionIds } from "./access";

const LIKE_ESCAPE_CHAR = "!";

/** Escape LIKE wildcards so user input is matched literally (`!` is the ESCAPE char). */
export function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`);
}

export type UserListScopeFilters = {
  role?: Role;
  search?: string;
  isActive?: boolean;
  createdAt?: { gte?: Date; lt?: Date };
};

/**
 * Scoped `where` shared by the user list page and its export. Deleted users
 * are never listed; an ADMIN only sees USER accounts assigned to their
 * regions, and only SUPERADMIN can filter by role. The `null` return is kept
 * for callers that skip the query on "matches nobody"; it is no longer produced.
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
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    // AND-ed with the scoped clause above, so a search can only narrow the
    // visible set and never widen it past the actor's regions.
    where.AND = [
      {
        OR: [
          { name: { contains: filters.search } },
          { email: { contains: filters.search } },
          { profile: { is: { whatsapp: { contains: filters.search } } } },
        ],
      },
    ];
  }
  return where;
}
