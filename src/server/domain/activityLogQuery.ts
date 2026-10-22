import "server-only";

import { ActivityAction, type Prisma } from "@prisma/client";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db/prisma";
import { getScopedRegionIds } from "./access";

export type ActivityLogCategory = "auth" | "system";

export type ActivityLogScopeFilters = {
  action?: ActivityAction;
  category?: ActivityLogCategory;
  createdAt?: { gte?: Date; lt?: Date };
};

export const AUTH_ACTIVITY_ACTIONS: readonly ActivityAction[] = [
  ActivityAction.AUTH_LOGIN,
  ActivityAction.AUTH_LOGOUT,
  ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
  ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
];

/**
 * Scoped `where` shared by the log pages and their exports, so both read paths
 * apply the same role rules. `null` means the caller may see no logs at all:
 * USER never sees logs, and an ADMIN without regions has nothing in scope.
 * An ADMIN sees their own entries, entries by users assigned to their regions,
 * and system (actor-less) entries in those regions.
 */
export async function buildActivityLogWhere(
  session: SessionUser,
  filters: ActivityLogScopeFilters = {},
): Promise<Prisma.ActivityLogWhereInput | null> {
  if (session.role === "USER") return null;

  const conditions: Prisma.ActivityLogWhereInput[] = [];
  if (filters.action) conditions.push({ action: filters.action });
  else if (filters.category === "auth") conditions.push({ action: { in: [...AUTH_ACTIVITY_ACTIONS] } });
  else if (filters.category === "system") conditions.push({ action: { notIn: [...AUTH_ACTIVITY_ACTIONS] } });
  if (filters.createdAt) conditions.push({ createdAt: filters.createdAt });

  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    if (!regionIds || regionIds.length === 0) return null;

    const users = await prisma.userRegionAssignment.findMany({
      where: { regionId: { in: regionIds } },
      select: { userId: true },
    });
    const allowedUserIds = [...new Set([session.id, ...users.map((row) => row.userId)])];
    conditions.push({
      OR: [{ actorId: { in: allowedUserIds } }, { AND: [{ actorId: null }, { regionId: { in: regionIds } }] }],
    });
  }

  return conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0]! : { AND: conditions };
}
