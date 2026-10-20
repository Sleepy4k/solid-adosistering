import { type ActivityAction, type Prisma } from "@prisma/client";
import { getRequestHeader, getRequestIP } from "@solidjs/start/http";
import { serverConfig } from "../config";
import { prisma } from "../db/prisma";

function requestAuditFields() {
  try {
    return {
      ipAddress: getRequestIP({ xForwardedFor: serverConfig.trustProxy })?.slice(0, 64) ?? null,
      userAgent: getRequestHeader("user-agent")?.slice(0, 512) ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function logActivity(input: {
  actorId?: string;
  regionId?: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const audit = requestAuditFields();
  await prisma.activityLog.create({
    data: {
      actorId: input.actorId === "system" ? undefined : input.actorId,
      regionId: input.regionId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ...audit,
    },
  });
}
