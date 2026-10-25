"use server";

import { createHmac } from "node:crypto";
import { ActivityAction, NewsletterStatus, Prisma } from "@prisma/client";
import { getRequestIP } from "@solidjs/start/http";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { getNewsletterTokenSecret, serverConfig } from "../config";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { assertSuperadmin, constantTimeEqual, hashToken, newOpaqueToken } from "../auth/security";
import { getSession } from "../auth/session";
import { resolveSort } from "~/lib/shared/tableSort";
import {
  createSmtpTransporter,
  getEmailBrandConfig,
  sendNewsletterConfirmationEmail,
  sendTransactionalEmail,
} from "../integrations/email";
import {
  bulkEmailSchema,
  idInputSchema,
  newsletterConfirmSchema,
  newsletterResendSchema,
  newsletterSchema,
  newsletterUnsubscribeSchema,
  parseInput,
  subscriberListSchema,
} from "../validation";
import { logActivity } from "../domain";
import { newsletterTemplate } from "~/templates/email/newsletter";
import { ROUTES } from "~/constants/routes";

const CONFIRMATION_COOLDOWN_MS = 60_000;
const UNSUBSCRIBE_CONTEXT = "newsletter-unsubscribe";
const BULK_BATCH_SIZE = 250;
const BULK_WORKER_COUNT = 5;
const HOUR_MS = 60 * 60_000;
/** Keyset cursor: `<subscribedAt epoch ms>.<subscriber id>`; both parts bounded to keep parsing linear. */
const BULK_CURSOR_PATTERN = /^(\d{1,15})\.([A-Za-z0-9_-]{1,128})$/;
/**
 * A cursor timestamp more than a year ahead can only be forged. Rejecting it
 * before Prisma hands it to MySQL keeps a hostile value away from DATETIME
 * range checks, which would otherwise surface as an opaque 500.
 */
const BULK_CURSOR_MAX_FUTURE_MS = 365 * 24 * HOUR_MS;

/** Allow-listed sort keys; each is a real NewsletterSubscriber column. */
const SUBSCRIBER_SORT_KEYS = ["email", "status", "subscribedAt", "confirmedAt", "unsubscribedAt"] as const;

type SubscriberStatus = "PENDING" | "CONFIRMED" | "UNSUBSCRIBED";
type SubscriberListItem = {
  id: string;
  email: string;
  status: SubscriberStatus;
  subscribedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};
type SubscriberCounts = { PENDING: number; CONFIRMED: number; UNSUBSCRIBED: number };

function clientIp() {
  try {
    return getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function confirmationUrl(token: string): string {
  return `${serverConfig.appOrigin}${ROUTES.newsletterConfirm}?token=${encodeURIComponent(token)}`;
}

function unsubscribeSignature(subscriberId: string, email: string): string {
  return createHmac("sha256", getNewsletterTokenSecret())
    .update(`${UNSUBSCRIBE_CONTEXT}:${subscriberId}:${email}`)
    .digest("base64url");
}

/** Signed, stateless unsubscribe token: `<subscriberId>.<base64url HMAC-SHA256>`. */
function createUnsubscribeToken(subscriberId: string, email: string): string {
  return `${subscriberId}.${unsubscribeSignature(subscriberId, email)}`;
}

function unsubscribeUrl(subscriberId: string, email: string): string {
  return `${serverConfig.appOrigin}${ROUTES.newsletterUnsubscribe}?token=${encodeURIComponent(
    createUnsubscribeToken(subscriberId, email),
  )}`;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function invalidBulkCursorResponse(): Response {
  return new Response("Cursor batch tidak valid.", { status: 400 });
}

/**
 * Audit writes are best-effort: the business mutation has already committed,
 * so a failed activity insert must be logged rather than turned into a 500.
 */
async function auditNewsletter(input: Parameters<typeof logActivity>[0]): Promise<void> {
  try {
    await logActivity(input);
  } catch (error) {
    console.error("[newsletter] activity audit failed:", error instanceof Error ? error.message : "unknown error");
  }
}

/**
 * Decodes the opaque keyset cursor. Only `<epoch ms>.<id>` is accepted; the
 * anchored, bounded pattern keeps parsing linear-time for hostile input.
 */
function parseBulkCursor(cursor: string | undefined): { timestamp: number; id: string } | null {
  if (cursor === undefined) return null;
  const match = BULK_CURSOR_PATTERN.exec(cursor);
  const rawTimestamp = match?.[1];
  const id = match?.[2];
  if (!rawTimestamp || !id) throw invalidBulkCursorResponse();
  const timestamp = Number(rawTimestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw invalidBulkCursorResponse();
  if (timestamp - Date.now() > BULK_CURSOR_MAX_FUTURE_MS) throw invalidBulkCursorResponse();
  return { timestamp, id };
}

function invalidUnsubscribeResponse(): Response {
  return new Response("Tautan berhenti berlangganan tidak valid.", { status: 400 });
}

function pendingSubscriberResponse(): Response {
  return new Response("Subscriber tidak ditemukan atau sudah tidak menunggu konfirmasi.", { status: 404 });
}

export async function subscribeNewsletter(email: string) {
  const normalized = parseInput(newsletterSchema, email);
  const limit = checkRateLimit(`newsletter:subscribe:ip:${clientIp()}`, 10, HOUR_MS);
  if (!limit.allowed) throw rateLimitResponse(limit);

  const now = new Date();
  const cutoff = new Date(now.getTime() - CONFIRMATION_COOLDOWN_MS);
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email: normalized },
    select: { id: true, status: true, lastConfirmationSentAt: true },
  });

  // Already opted in: acknowledge without leaking account state or sending mail.
  if (existing?.status === NewsletterStatus.CONFIRMED) return { ok: true };

  // Cooldown prevents repeated requests from flooding a mailbox.
  if (
    existing?.status === NewsletterStatus.PENDING &&
    existing.lastConfirmationSentAt &&
    existing.lastConfirmationSentAt.getTime() > cutoff.getTime()
  ) {
    return { ok: true };
  }

  const token = newOpaqueToken(32);
  const expiresAt = new Date(now.getTime() + serverConfig.newsletter.confirmTtlHours * HOUR_MS);
  const pendingData = {
    status: NewsletterStatus.PENDING,
    confirmationTokenHash: hashToken(token),
    confirmationExpiresAt: expiresAt,
    lastConfirmationSentAt: now,
    consentSource: "LANDING_FORM",
    confirmedAt: null,
    unsubscribedAt: null,
  };

  if (existing?.status === NewsletterStatus.PENDING) {
    // Atomic claim: only the request that still observes an expired/absent
    // cooldown may rotate the token and send. Losers acknowledge silently.
    const claimed = await prisma.newsletterSubscriber.updateMany({
      where: {
        id: existing.id,
        status: NewsletterStatus.PENDING,
        OR: [{ lastConfirmationSentAt: null }, { lastConfirmationSentAt: { lt: cutoff } }],
      },
      data: pendingData,
    });
    if (claimed.count === 0) return { ok: true };
  } else if (existing?.status === NewsletterStatus.UNSUBSCRIBED) {
    // Re-opting in after an unsubscribe starts a new subscription window.
    const claimed = await prisma.newsletterSubscriber.updateMany({
      where: { id: existing.id, status: NewsletterStatus.UNSUBSCRIBED },
      data: { ...pendingData, subscribedAt: now },
    });
    if (claimed.count === 0) return { ok: true };
  } else {
    try {
      await prisma.newsletterSubscriber.create({ data: { email: normalized, ...pendingData } });
    } catch (error) {
      // Another concurrent request created the row first; it owns delivery.
      if (isUniqueConstraint(error)) return { ok: true };
      throw error;
    }
  }

  // Fire-and-forget: SMTP latency must not be observable from the public
  // action, and delivery failures are logged server-side only.
  const confirmUrl = confirmationUrl(token);
  void sendNewsletterConfirmationEmail({ to: normalized, confirmUrl, expiresAt }).catch((error: unknown) => {
    console.error(
      "[newsletter] confirmation email delivery failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    if (process.env.NODE_ENV === "development") {
      console.warn(`[newsletter] Confirmation URL (development only): ${confirmUrl}`);
    }
  });

  return { ok: true };
}

export async function confirmNewsletterSubscription(input: { token: string }) {
  const data = parseInput(newsletterConfirmSchema, input);
  const limit = checkRateLimit(`newsletter:confirm:ip:${clientIp()}`, 20, HOUR_MS);
  if (!limit.allowed) throw rateLimitResponse(limit);

  const tokenHash = hashToken(data.token);
  const now = new Date();
  const subscriber = await prisma.newsletterSubscriber.findFirst({
    where: { confirmationTokenHash: tokenHash, status: NewsletterStatus.PENDING },
    select: { id: true, confirmationExpiresAt: true },
  });
  if (!subscriber) throw new Response("Tautan konfirmasi tidak valid.", { status: 400 });
  if (!subscriber.confirmationExpiresAt || subscriber.confirmationExpiresAt.getTime() <= now.getTime()) {
    throw new Response("Tautan konfirmasi sudah kedaluwarsa. Silakan minta kirim ulang.", { status: 410 });
  }

  // Guard the state transition atomically: a token can only be consumed once.
  const updated = await prisma.newsletterSubscriber.updateMany({
    where: {
      id: subscriber.id,
      status: NewsletterStatus.PENDING,
      confirmationTokenHash: tokenHash,
      confirmationExpiresAt: { gt: now },
    },
    data: {
      status: NewsletterStatus.CONFIRMED,
      confirmedAt: now,
      unsubscribedAt: null,
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
    },
  });
  if (updated.count === 0) throw new Response("Tautan konfirmasi tidak valid.", { status: 400 });

  await auditNewsletter({
    action: ActivityAction.UPDATE,
    entityType: "NewsletterSubscriber",
    entityId: subscriber.id,
    metadata: { event: "confirmed" },
  });

  return { ok: true };
}

export async function unsubscribeNewsletter(input: { token: string }) {
  const data = parseInput(newsletterUnsubscribeSchema, input);
  const limit = checkRateLimit(`newsletter:unsubscribe:ip:${clientIp()}`, 20, HOUR_MS);
  if (!limit.allowed) throw rateLimitResponse(limit);

  const separator = data.token.indexOf(".");
  if (separator <= 0 || separator === data.token.length - 1) throw invalidUnsubscribeResponse();
  const subscriberId = data.token.slice(0, separator);
  const providedSignature = data.token.slice(separator + 1);
  if (!subscriberId || !providedSignature || subscriberId.length > 128) throw invalidUnsubscribeResponse();

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, email: true, unsubscribedAt: true },
  });
  if (!subscriber) throw invalidUnsubscribeResponse();

  // The signature binds the id and email; `constantTimeEqual` wraps
  // node:crypto `timingSafeEqual` so forged signatures cannot be probed byte by byte.
  if (!constantTimeEqual(providedSignature, unsubscribeSignature(subscriber.id, subscriber.email))) {
    throw invalidUnsubscribeResponse();
  }

  await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: {
      status: NewsletterStatus.UNSUBSCRIBED,
      unsubscribedAt: subscriber.unsubscribedAt ?? new Date(),
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
    },
  });

  await auditNewsletter({
    action: ActivityAction.UPDATE,
    entityType: "NewsletterSubscriber",
    entityId: subscriber.id,
    metadata: { event: "unsubscribed" },
  });

  return { ok: true };
}

export async function getAllSubscribers(input?: {
  page?: number;
  pageSize?: number;
  status?: SubscriberStatus;
  search?: string;
  sort?: { key?: string; dir?: string };
}): Promise<{ items: SubscriberListItem[]; total: number; counts: SubscriberCounts }> {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const { page, pageSize, status, search, sort: sortInput } = parseInput(subscriberListSchema, input ?? {});
  const sort = resolveSort(SUBSCRIBER_SORT_KEYS, sortInput, { key: "subscribedAt", dir: "desc" });
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(status ? { status } : {}),
    ...(search ? { email: { contains: search } } : {}),
  };
  const [items, total, groups] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: [{ [sort.key]: sort.dir }, { id: "desc" }],
      skip: page * pageSize,
      take: pageSize,
      // Explicit projection: confirmation token material must never reach the UI.
      select: {
        id: true,
        email: true,
        status: true,
        subscribedAt: true,
        confirmedAt: true,
        unsubscribedAt: true,
      },
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: SubscriberCounts = { PENDING: 0, CONFIRMED: 0, UNSUBSCRIBED: 0 };
  for (const group of groups) {
    counts[group.status] = group._count._all;
  }

  return { items, total, counts };
}

export async function deleteSubscriber(id: string) {
  const data = parseInput(idInputSchema, { id });
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);
  await prisma.newsletterSubscriber.delete({ where: { id: data.id } });
  await auditNewsletter({
    actorId: session.id,
    action: ActivityAction.DELETE,
    entityType: "NewsletterSubscriber",
    entityId: data.id,
  });
  return { ok: true };
}

export async function resendNewsletterConfirmation(input: { id: string }) {
  const data = parseInput(newsletterResendSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { id: data.id },
    select: {
      id: true,
      email: true,
      status: true,
      confirmationTokenHash: true,
      confirmationExpiresAt: true,
      lastConfirmationSentAt: true,
    },
  });
  if (!subscriber || subscriber.status !== NewsletterStatus.PENDING) throw pendingSubscriberResponse();

  const now = new Date();
  const cutoff = new Date(now.getTime() - CONFIRMATION_COOLDOWN_MS);
  const token = newOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + serverConfig.newsletter.confirmTtlHours * HOUR_MS);

  // One compare-and-swap claim: the cooldown check and the token rotation
  // cannot be interleaved by two concurrent SUPERADMIN resends.
  const claimed = await prisma.newsletterSubscriber.updateMany({
    where: {
      id: subscriber.id,
      status: NewsletterStatus.PENDING,
      OR: [{ lastConfirmationSentAt: null }, { lastConfirmationSentAt: { lt: cutoff } }],
    },
    data: { confirmationTokenHash: tokenHash, confirmationExpiresAt: expiresAt, lastConfirmationSentAt: now },
  });

  if (claimed.count === 0) {
    // Re-read only to distinguish a vanished/non-pending row from a cooldown
    // loss; the timestamp used for Retry-After is always the current one.
    const current = await prisma.newsletterSubscriber.findUnique({
      where: { id: subscriber.id },
      select: { status: true, lastConfirmationSentAt: true },
    });
    if (!current || current.status !== NewsletterStatus.PENDING) throw pendingSubscriberResponse();

    const elapsed = current.lastConfirmationSentAt
      ? now.getTime() - current.lastConfirmationSentAt.getTime()
      : CONFIRMATION_COOLDOWN_MS;
    const retryAfterSec = Math.max(1, Math.ceil((CONFIRMATION_COOLDOWN_MS - elapsed) / 1000));
    throw new Response(`Tunggu ${retryAfterSec} detik sebelum mengirim ulang email konfirmasi.`, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" },
    });
  }

  try {
    await sendNewsletterConfirmationEmail({ to: subscriber.email, confirmUrl: confirmationUrl(token), expiresAt });
  } catch (error) {
    console.error(
      "[newsletter] resend confirmation email failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    // Restore the pre-claim link only while this attempt still owns the row,
    // so a concurrent successful resend is never rolled back.
    try {
      await prisma.newsletterSubscriber.updateMany({
        where: { id: subscriber.id, status: NewsletterStatus.PENDING, confirmationTokenHash: tokenHash },
        data: {
          confirmationTokenHash: subscriber.confirmationTokenHash,
          confirmationExpiresAt: subscriber.confirmationExpiresAt,
          lastConfirmationSentAt: subscriber.lastConfirmationSentAt,
        },
      });
    } catch (restoreError) {
      console.error(
        "[newsletter] resend token restore failed:",
        restoreError instanceof Error ? restoreError.message : "unknown error",
      );
    }
    throw new Response("Gagal mengirim email konfirmasi. Coba lagi nanti.", { status: 502 });
  }

  await auditNewsletter({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "NewsletterSubscriber",
    entityId: subscriber.id,
    metadata: { event: "confirmation_resent" },
  });

  return { ok: true };
}

export async function sendBulkEmail(input: {
  subject: string;
  body: string;
  cursor?: string | null;
}): Promise<{ ok: true; sent: number; failed: number; nextCursor: string | null }> {
  const data = parseInput(bulkEmailSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  const cursor = parseBulkCursor(data.cursor);
  const cursorDate = cursor ? new Date(cursor.timestamp) : null;

  // Keyset pagination over (subscribedAt, id) desc. Fetch one extra row to
  // detect whether another batch exists without a second count query.
  const recipients = await prisma.newsletterSubscriber.findMany({
    where: {
      status: NewsletterStatus.CONFIRMED,
      ...(cursor && cursorDate
        ? {
            OR: [{ subscribedAt: { lt: cursorDate } }, { subscribedAt: cursorDate, id: { lt: cursor.id } }],
          }
        : {}),
    },
    orderBy: [{ subscribedAt: "desc" }, { id: "desc" }],
    take: BULK_BATCH_SIZE + 1,
    select: { id: true, email: true, subscribedAt: true },
  });

  const hasMore = recipients.length > BULK_BATCH_SIZE;
  const batch = hasMore ? recipients.slice(0, BULK_BATCH_SIZE) : recipients;
  if (batch.length === 0) throw new Response("Tidak ada subscriber terkonfirmasi.", { status: 400 });

  const last = batch[batch.length - 1];
  const nextCursor = hasMore && last ? `${last.subscribedAt.getTime()}.${last.id}` : null;

  const brandConfig = await getEmailBrandConfig();
  // Pooled transporter: 5 SMTP connections are reused across this batch's
  // 5 workers, then closed in `finally` so no sockets leak between requests.
  const transporter = createSmtpTransporter({ pool: true });
  let sent = 0;
  let failed = 0;
  let index = 0;

  const worker = async () => {
    while (index < batch.length) {
      const current = batch[index++];
      if (!current) continue;

      // Each recipient gets a signed link so no shared bearer token is reused.
      const template = newsletterTemplate({
        subject: data.subject,
        body: data.body,
        config: brandConfig,
        unsubscribeUrl: unsubscribeUrl(current.id, current.email),
      });

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

  try {
    await Promise.all(Array.from({ length: Math.min(BULK_WORKER_COUNT, batch.length) }, worker));
  } finally {
    transporter.close();
  }

  await auditNewsletter({
    actorId: session.id,
    action: ActivityAction.CREATE,
    entityType: "BulkEmail",
    metadata: { sent, failed, total: batch.length, batch: true },
  });

  return { ok: true, sent, failed, nextCursor };
}
