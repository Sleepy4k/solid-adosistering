"use server";

import { randomBytes } from "node:crypto";
import { getRequestIP } from "@solidjs/start/http";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { serverConfig } from "../config";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { assertSuperadmin } from "../auth/security";
import { getSession } from "../auth/session";
import { contactListSchema, contactSchema, markContactReadSchema, parseInput } from "../validation";
import { logActivity } from "../domain";
import { ActivityAction } from "@prisma/client";

function clientIp() {
  try {
    return getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function saveContactSubmission(input: {
  name: string;
  email: string;
  phone?: string;
  userType?: string;
  message: string;
}) {
  const data = parseInput(contactSchema, input);
  const ipLimit = checkRateLimit(`contact:ip:${clientIp()}`, 5, 60 * 60_000);
  if (!ipLimit.allowed) throw rateLimitResponse(ipLimit);
  const emailLimit = checkRateLimit(`contact:email:${data.email}`, 3, 6 * 60 * 60_000);
  if (!emailLimit.allowed) throw rateLimitResponse(emailLimit);

  await prisma.contactSubmission.create({
    data: {
      id: randomBytes(10).toString("hex"),
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      userType: data.userType ?? null,
      message: data.message,
    },
  });
  return { ok: true };
}

export async function getContactSubmissions(input?: { unreadOnly?: boolean }) {
  const data = input ? parseInput(contactListSchema, input) : {};
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  return prisma.contactSubmission.findMany({
    where: data.unreadOnly ? { isRead: false } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function markContactRead(input: { id: string; isRead: boolean }) {
  const data = parseInput(markContactReadSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.contactSubmission.update({ where: { id: data.id }, data: { isRead: data.isRead } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "ContactSubmission",
    entityId: data.id,
    metadata: { isRead: data.isRead },
  });
  return { ok: true };
}
