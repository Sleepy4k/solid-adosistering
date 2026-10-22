"use server";

import type { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getSession } from "../auth/session";
import { buildActivityLogWhere } from "../domain/activityLogQuery";
import { activityLogFiltersSchema, parseInput } from "../validation";
import type { ActivityLogItem } from "~/types/logs";

export type { ActivityLogItem };

export async function getActivityLogs(input?: {
  action?: string;
  category?: "auth" | "system";
  limit?: number;
  offset?: number;
}) {
  const data = input ? parseInput(activityLogFiltersSchema, input) : {};
  const session = await getSession();
  if (!session) throw redirect("/login");
  if (session.role === "USER") return { logs: [], total: 0, forbidden: true };

  const where = await buildActivityLogWhere(session, {
    ...(data.action ? { action: data.action as ActivityAction } : {}),
    ...(data.category ? { category: data.category } : {}),
  });
  if (!where) return { logs: [], total: 0 };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: data.limit ?? 50,
      skip: data.offset ?? 0,
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
