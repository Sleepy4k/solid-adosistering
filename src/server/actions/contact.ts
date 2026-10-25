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
import { ActivityAction, type Prisma } from "@prisma/client";
import { resolveSort, type SortDir } from "~/lib/shared/tableSort";

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

const CONTACT_SORT_KEYS = ["name", "email", "userType", "createdAt", "isRead"] as const;
type ContactSortKey = (typeof CONTACT_SORT_KEYS)[number];

const CONTACT_ORDER_BY: Record<ContactSortKey, (dir: SortDir) => Prisma.ContactSubmissionOrderByWithRelationInput> = {
  name: (dir) => ({ name: dir }),
  email: (dir) => ({ email: dir }),
  userType: (dir) => ({ userType: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  isRead: (dir) => ({ isRead: dir }),
};

/** Calendar day (WIB) boundaries so the date filter matches what the admin sees. */
function wibDayStart(day: string) {
  return new Date(`${day}T00:00:00.000+07:00`);
}
function wibDayEnd(day: string) {
  return new Date(`${day}T23:59:59.999+07:00`);
}

export type ContactInboxInput = {
  unreadOnly?: boolean;
  readState?: "all" | "unread" | "read";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: { key?: string; dir?: string };
  limit?: number;
  offset?: number;
};

export async function getContactInbox(input?: ContactInboxInput) {
  const data = parseInput(contactListSchema, input ?? {});
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const readState = data.readState ?? (data.unreadOnly ? "unread" : "all");
  const sort = resolveSort(CONTACT_SORT_KEYS, data.sort, { key: "createdAt", dir: "desc" });
  const dateFrom = data.dateFrom ? wibDayStart(data.dateFrom) : undefined;
  const dateTo = data.dateTo ? wibDayEnd(data.dateTo) : undefined;

  const where: Prisma.ContactSubmissionWhereInput = {
    ...(readState === "unread" ? { isRead: false } : readState === "read" ? { isRead: true } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom && !Number.isNaN(dateFrom.getTime()) ? { gte: dateFrom } : {}),
            ...(dateTo && !Number.isNaN(dateTo.getTime()) ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(data.search
      ? {
          OR: [
            { name: { contains: data.search } },
            { email: { contains: data.search } },
            { phone: { contains: data.search } },
            { message: { contains: data.search } },
          ],
        }
      : {}),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.contactSubmission.findMany({
      where,
      // id sebagai tie-breaker agar urutan halaman stabil
      orderBy: [CONTACT_ORDER_BY[sort.key](sort.dir), { id: "desc" }],
      take: data.limit ?? 25,
      skip: data.offset ?? 0,
    }),
    prisma.contactSubmission.count({ where }),
    prisma.contactSubmission.count({ where: { isRead: false } }),
  ]);
  return { items, total, unreadCount };
}

export async function getContactSubmissions(input?: ContactInboxInput) {
  return (await getContactInbox(input)).items;
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
