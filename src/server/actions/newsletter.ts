"use server";

import { ActivityAction } from "@prisma/client";
import { getRequestIP } from "@solidjs/start/http";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { serverConfig } from "../config";
import { checkRateLimit, rateLimitResponse } from "../rateLimit";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";
import { createSmtpTransporter, getEmailBrandConfig, sendTransactionalEmail } from "../email";
import { bulkEmailSchema, idInputSchema, newsletterSchema, parseInput } from "../validation";
import { logActivity } from "./_helpers";
import { newsletterTemplate } from "~/templates/email/newsletter";

function clientIp() {
  try {
    return getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function subscribeNewsletter(email: string) {
  const normalized = parseInput(newsletterSchema, email);
  const limit = checkRateLimit(`newsletter:ip:${clientIp()}`, 10, 60 * 60_000);
  if (!limit.allowed) throw rateLimitResponse(limit);

  await prisma.newsletterSubscriber.upsert({
    where: { email: normalized },
    update: { isActive: true, unsubscribedAt: null },
    create: { email: normalized },
  });
  return { ok: true };
}

export async function getAllSubscribers() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  return prisma.newsletterSubscriber.findMany({ orderBy: { subscribedAt: "desc" }, take: 10_000 });
}

export async function deleteSubscriber(id: string) {
  const data = parseInput(idInputSchema, { id });
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.newsletterSubscriber.delete({ where: { id: data.id } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "NewsletterSubscriber",
    entityId: data.id,
  });
  return { ok: true };
}

export async function sendBulkEmail(input: { subject: string; body: string }) {
  const data = parseInput(bulkEmailSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { isActive: true },
    select: { email: true },
    take: 10_000,
  });
  if (subscribers.length === 0) throw new Response("Tidak ada subscriber aktif.", { status: 400 });

  const brandConfig = await getEmailBrandConfig();
  const template = newsletterTemplate({ subject: data.subject, body: data.body, config: brandConfig });
  let sent = 0;
  let failed = 0;
  let index = 0;
  const transporter = createSmtpTransporter();

  const worker = async () => {
    while (index < subscribers.length) {
      const current = subscribers[index++];
      if (!current) continue;
      try {
        await sendTransactionalEmail(
          { to: current.email, subject: data.subject, text: template.text, html: template.html },
          transporter,
        );
        sent++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, subscribers.length) }, worker));

  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "BulkEmail",
    metadata: { sent, failed, total: subscribers.length },
  });

  return { ok: true, sent, failed };
}
