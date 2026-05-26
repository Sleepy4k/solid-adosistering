"use server";

import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";
import { createSmtpTransporter, getEmailBrandConfig, sendTransactionalEmail } from "../email";
import { logActivity } from "./_helpers";
import { newsletterTemplate } from "~/templates/email/newsletter";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function subscribeNewsletter(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Response("Format email tidak valid.", { status: 400 });
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
  return prisma.newsletterSubscriber.findMany({ orderBy: { subscribedAt: "desc" } });
}

export async function deleteSubscriber(id: string) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.newsletterSubscriber.delete({ where: { id } });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "NewsletterSubscriber",
    entityId: id,
  });
  return { ok: true };
}

export async function sendBulkEmail(input: { subject: string; body: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new Response("Subjek dan isi pesan wajib diisi.", { status: 400 });

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { isActive: true },
    select: { email: true },
  });
  if (subscribers.length === 0) throw new Response("Tidak ada subscriber aktif.", { status: 400 });

  const brandConfig = await getEmailBrandConfig();
  const template = newsletterTemplate({ subject, body, config: brandConfig });
  let sent = 0;
  let failed = 0;

  const transporter = createSmtpTransporter();
  for (const sub of subscribers) {
    try {
      await sendTransactionalEmail({ to: sub.email, subject, text: template.text, html: template.html }, transporter);
      sent++;
    } catch {
      failed++;
    }
  }

  await logActivity({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "BulkEmail",
    metadata: { subject, sent, failed, total: subscribers.length },
  });

  return { ok: true, sent, failed };
}
