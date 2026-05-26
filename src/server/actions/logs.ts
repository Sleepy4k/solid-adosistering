"use server";

import type { Prisma } from "@prisma/client";
import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../session";
import { getScopedRegionIds } from "./_helpers";
import type { ActivityLogItem } from "~/types/logs";

export type { ActivityLogItem };

export async function getActivityLogs(input?: {
  action?: string;
  category?: "auth" | "system";
  limit?: number;
  offset?: number;
}) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") return { logs: [], total: 0, forbidden: true };

  const authActions = [
    ActivityAction.AUTH_LOGIN,
    ActivityAction.AUTH_LOGOUT,
    ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
    ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
  ];
  const baseWhere: Prisma.ActivityLogWhereInput = input?.action
    ? { action: input.action as ActivityAction }
    : input?.category === "auth"
      ? { action: { in: authActions } }
      : input?.category === "system"
        ? { action: { notIn: authActions } }
        : {};

  let where: Prisma.ActivityLogWhereInput = baseWhere;

  if (session.role === "ADMIN") {
    const regionIds = await getScopedRegionIds(session);
    if (!regionIds || regionIds.length === 0) return { logs: [], total: 0 };

    const users = await prisma.userRegionAssignment.findMany({
      where: { regionId: { in: regionIds } },
      select: { userId: true },
    });
    const allowedUserIds = [...new Set([session.id, ...users.map((row) => row.userId)])];

    where = {
      AND: [
        baseWhere,
        {
          OR: [{ actorId: { in: allowedUserIds } }, { AND: [{ actorId: null }, { regionId: { in: regionIds } }] }],
        },
      ],
    };
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input?.limit ?? 50,
      skip: input?.offset ?? 0,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        metadata: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { logs: logs as ActivityLogItem[], total };
}
