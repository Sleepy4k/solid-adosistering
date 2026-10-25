"use server";

import { getRequestHeader, getRequestIP } from "@solidjs/start/http";
import { ActivityAction } from "@prisma/client";
import { prisma } from "../db/prisma";
import { sendLoginBlockedEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "../integrations/email";
import { serverConfig } from "../config";
import { clearLoginThrottle, reserveLoginAttempt, throttleKey, withLoginThrottleLocks } from "../auth/loginRateLimit";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { hashPassword, hashToken, needsPasswordRehash, newOpaqueToken, verifyPassword } from "../auth/security";
import { createSession, destroyAllUserSessions, destroySession, getSession } from "../auth/session";
import { completePasswordResetSchema, loginSchema, parseInput, requestPasswordResetSchema } from "../validation";
import { cooldownResponse, invalidCredentialsResponse } from "../auth/responses";
import { logActivity } from "../domain";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$o/FuPMYk2xl3lntHPF/UkA$nSRoSKATdnlXTPajJ4+/ejTJb+zpqVkXMuQwjPyU+QY";

const LOGIN_BLOCKED_NOTIFICATION_INTERVAL_MS = 60 * 60_000;
const MAX_NOTIFICATION_ENTRIES = 10_000;

/**
 * Per-user notification throttle. An attacker guessing one account's password
 * must not be able to trigger an unbounded stream of "login blocked" emails.
 */
const loginBlockedNotifications = new Map<string, number>();

function shouldNotifyLoginBlocked(userId: string, now = Date.now()): boolean {
  const lastSentAt = loginBlockedNotifications.get(userId);
  if (lastSentAt !== undefined && now - lastSentAt < LOGIN_BLOCKED_NOTIFICATION_INTERVAL_MS) return false;

  loginBlockedNotifications.set(userId, now);
  if (loginBlockedNotifications.size > MAX_NOTIFICATION_ENTRIES) {
    for (const [key, sentAt] of loginBlockedNotifications) {
      if (loginBlockedNotifications.size <= MAX_NOTIFICATION_ENTRIES) break;
      if (now - sentAt >= LOGIN_BLOCKED_NOTIFICATION_INTERVAL_MS) loginBlockedNotifications.delete(key);
    }
  }
  return true;
}

let warnedProxyMisconfig = false;

function clientIp() {
  try {
    // A forwarded header while TRUST_PROXY is off usually means the app sits behind
    // a proxy: every client then shares the proxy IP (or "unknown"), which defeats
    // per-IP limits. Warn once instead of silently trusting a spoofable header.
    if (!warnedProxyMisconfig && !serverConfig.trustProxy && process.env.NODE_ENV === "production") {
      if (getRequestHeader("x-forwarded-for")) {
        warnedProxyMisconfig = true;
        console.warn("[auth] X-Forwarded-For diterima tetapi TRUST_PROXY=false; pembatasan per-IP tidak akurat.");
      }
    }
    return getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function login(input: { email: string; password: string }) {
  const data = parseInput(loginSchema, input);
  const ip = clientIp();
  const emailKey = throttleKey("email", data.email);

  // Coarse per-IP abuse brake. Deliberately high and non-escalating: a shared
  // IP (office NAT, mobile carrier) must not be able to lock every account out
  // through the per-email cooldown ladder. Never key this on "unknown".
  if (ip !== "unknown") {
    const ipLimit = checkRateLimit(`login:ip:${ip}`, 100, 15 * 60_000);
    if (!ipLimit.allowed) throw rateLimitResponse(ipLimit);
  }

  // Serialize the reserve/verify sequence per email so concurrent attempts
  // cannot bypass or race the failure counter within this process.
  return withLoginThrottleLocks([emailKey], async () => {
    // Reserve before verifying: every attempt consumes a slot, including a
    // successful one (cleared below once the login is fully authenticated).
    const reservation = await reserveLoginAttempt(emailKey);

    if (reservation.blocked) {
      const blockedUser = await prisma.user.findFirst({
        where: { email: data.email, deletedAt: null },
        select: { id: true, email: true, name: true },
      });
      if (blockedUser && shouldNotifyLoginBlocked(blockedUser.id)) {
        const mins = Math.ceil(reservation.retryAfterSec / 60);
        sendLoginBlockedEmail({
          recipientId: blockedUser.id,
          to: blockedUser.email,
          userName: blockedUser.name,
          cooldownMinutes: mins,
        }).catch(() => console.error("[email] loginBlocked: delivery failed"));
      }
      throw cooldownResponse(reservation.retryAfterSec);
    }

    const user = await prisma.user.findFirst({
      where: { email: data.email, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
    });

    if (!user) {
      // Keep the response time close to the existing-account path so the
      // endpoint cannot be used to enumerate registered email addresses.
      await verifyPassword(data.password, DUMMY_PASSWORD_HASH);
      throw invalidCredentialsResponse(reservation.remaining);
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      throw invalidCredentialsResponse(reservation.remaining);
    }

    if (!user.isActive) {
      throw new Response("Akun Anda telah dinonaktifkan. Hubungi administrator untuk informasi lebih lanjut.", {
        status: 403,
      });
    }

    // Clear only after the account is confirmed active, so failed or disabled
    // logins keep their reserved slot.
    await clearLoginThrottle(emailKey);

    // Transparently upgrade legacy/weak Argon2 parameters on successful login.
    if (needsPasswordRehash(user.passwordHash)) {
      const upgraded = await hashPassword(data.password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } }).catch(() => undefined);
    }

    await createSession(user.id);
    await logActivity({
      actorId: user.id,
      action: ActivityAction.AUTH_LOGIN,
      entityType: "User",
      entityId: user.id,
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await logActivity({
      actorId: session.id,
      action: ActivityAction.AUTH_LOGOUT,
      entityType: "User",
      entityId: session.id,
    });
  }
  await destroySession();
  return { ok: true };
}

export async function requestPasswordReset(input: { email: string }) {
  const data = parseInput(requestPasswordResetSchema, input);
  const ip = clientIp();
  // Never key a bucket on "unknown": all unidentifiable clients would share it.
  // The per-email bucket below still applies.
  if (ip !== "unknown") {
    const ipLimit = checkRateLimit(`reset:ip:${ip}`, 10, 60 * 60_000);
    if (!ipLimit.allowed) throw rateLimitResponse(ipLimit);
  }
  const limit = checkRateLimit(
    ip === "unknown" ? `reset:email:${data.email}` : `reset:${ip}:${data.email}`,
    5,
    60 * 60_000,
  );
  if (!limit.allowed) throw rateLimitResponse(limit);

  const user = await prisma.user.findFirst({ where: { email: data.email, deletedAt: null } });
  if (!user) return { ok: true };

  // Token write, audit log and email run detached so the found and not-found
  // branches return after the same single lookup (no response-time oracle).
  void (async () => {
    const token = newOpaqueToken();
    const now = new Date();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + 1000 * 60 * 30),
        },
      }),
    ]);

    const resetUrl = `${serverConfig.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    void sendPasswordResetEmail({ recipientId: user.id, to: user.email, resetUrl }).catch(() =>
      console.error("[email] passwordReset: delivery failed"),
    );
    await logActivity({
      actorId: user.id,
      action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
      entityType: "User",
      entityId: user.id,
    });
  })().catch((error) => console.error("[auth] passwordReset: background task failed", error));
  return { ok: true };
}

export async function completePasswordReset(input: { token: string; newPassword: string }) {
  const data = parseInput(completePasswordResetSchema, input);
  const ip = clientIp();
  if (ip !== "unknown") {
    const limit = checkRateLimit(`reset-complete:${ip}`, 10, 60 * 60_000);
    if (!limit.allowed) throw rateLimitResponse(limit);
  }
  const tokenHash = hashToken(data.token);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new Response("Token tidak valid atau sudah kedaluwarsa", { status: 400 });
  }

  const resetUser = await prisma.user.findUnique({
    where: { id: reset.userId },
    select: { id: true, name: true, email: true },
  });
  const newHash = await hashPassword(data.newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Atomically consume the token: concurrent requests can only succeed once.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      throw new Response("Token tidak valid atau sudah kedaluwarsa", { status: 400 });
    }
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: newHash } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordResetToken.updateMany({
      where: { userId: reset.userId, usedAt: null, id: { not: reset.id } },
      data: { usedAt: now },
    });
  });
  // A successful reset proves control of the mailbox: clear the account's login
  // throttle so a prior cooldown cannot keep the owner locked out. Best-effort:
  // the helper already swallows storage errors, and a stale throttle must never
  // fail an otherwise valid reset.
  if (resetUser) {
    await clearLoginThrottle(throttleKey("email", resetUser.email)).catch(() => undefined);
  }
  await logActivity({
    actorId: reset.userId,
    action: ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
    entityType: "User",
    entityId: reset.userId,
  });
  if (resetUser) {
    sendPasswordChangedEmail({ recipientId: resetUser.id, to: resetUser.email, userName: resetUser.name }).catch(() =>
      console.error("[email] passwordChanged: delivery failed"),
    );
  }
  return { ok: true };
}

export async function logoutEverywhere() {
  const session = await getSession();
  if (!session) return { ok: true };
  await destroyAllUserSessions(session.id);
  await destroySession();
  return { ok: true };
}
