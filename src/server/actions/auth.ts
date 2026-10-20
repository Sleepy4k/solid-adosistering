"use server";

import { getRequestIP } from "@solidjs/start/http";
import { ActivityAction } from "@prisma/client";
import { prisma } from "../db/prisma";
import { sendLoginBlockedEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "../email";
import { serverConfig } from "../config";
import { checkLoginThrottle, clearLoginThrottle, registerLoginFailure, throttleKey } from "../loginRateLimit";
import { checkRateLimit, rateLimitResponse } from "../rateLimit";
import { hashPassword, hashToken, needsPasswordRehash, newOpaqueToken, verifyPassword } from "../security";
import { createSession, destroyAllUserSessions, destroySession, getSession } from "../session";
import { completePasswordResetSchema, loginSchema, parseInput, requestPasswordResetSchema } from "../validation";
import { cooldownResponse, invalidCredentialsResponse, logActivity } from "./_helpers";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$o/FuPMYk2xl3lntHPF/UkA$nSRoSKATdnlXTPajJ4+/ejTJb+zpqVkXMuQwjPyU+QY";

function clientIp() {
  try {
    return getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function login(input: { email: string; password: string }) {
  const data = parseInput(loginSchema, input);
  const ip = clientIp();
  const emailKey = throttleKey("email", data.email);
  const ipKey = throttleKey("ip", ip);

  const [emailThrottle, ipThrottle] = await Promise.all([checkLoginThrottle(emailKey), checkLoginThrottle(ipKey)]);
  const activeThrottle = emailThrottle.blocked ? emailThrottle : ipThrottle.blocked ? ipThrottle : null;
  if (activeThrottle) throw cooldownResponse(activeThrottle.retryAfterSec);

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
  });

  if (!user) {
    // Keep the response time close to the existing-account path so the
    // endpoint cannot be used to enumerate registered email addresses.
    await verifyPassword(data.password, DUMMY_PASSWORD_HASH);
    const [emailResult, ipResult] = await Promise.all([registerLoginFailure(emailKey), registerLoginFailure(ipKey)]);
    const result = emailResult.blocked ? emailResult : ipResult;
    throw result.blocked ? cooldownResponse(result.retryAfterSec) : invalidCredentialsResponse(result.remaining);
  }

  const valid = await verifyPassword(data.password, user.passwordHash);
  if (!valid) {
    const [emailResult, ipResult] = await Promise.all([registerLoginFailure(emailKey), registerLoginFailure(ipKey)]);
    const result = emailResult.blocked ? emailResult : ipResult;
    if (result.blocked) {
      const mins = Math.ceil(result.retryAfterSec / 60);
      sendLoginBlockedEmail({ recipientId: user.id, to: user.email, userName: user.name, cooldownMinutes: mins }).catch(
        (err: unknown) => console.error("[email] loginBlocked:", err),
      );
      throw cooldownResponse(result.retryAfterSec);
    }
    throw invalidCredentialsResponse(result.remaining);
  }

  await Promise.all([clearLoginThrottle(emailKey), clearLoginThrottle(ipKey)]);

  if (!user.isActive) {
    throw new Response("Akun Anda telah dinonaktifkan. Hubungi administrator untuk informasi lebih lanjut.", {
      status: 403,
    });
  }

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
  const ipLimit = checkRateLimit(`reset:ip:${ip}`, 10, 60 * 60_000);
  if (!ipLimit.allowed) throw rateLimitResponse(ipLimit);
  const limit = checkRateLimit(`reset:${ip}:${data.email}`, 5, 60 * 60_000);
  if (!limit.allowed) throw rateLimitResponse(limit);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) return { ok: true };

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
  // Do not block the generic response on SMTP; this also avoids a timing oracle.
  void sendPasswordResetEmail({ recipientId: user.id, to: user.email, resetUrl }).catch((error: unknown) =>
    console.error("[email] passwordReset:", error),
  );
  await logActivity({
    actorId: user.id,
    action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
    entityType: "User",
    entityId: user.id,
  });
  return { ok: true };
}

export async function completePasswordReset(input: { token: string; newPassword: string }) {
  const data = parseInput(completePasswordResetSchema, input);
  const ip = clientIp();
  const limit = checkRateLimit(`reset-complete:${ip}`, 10, 60 * 60_000);
  if (!limit.allowed) throw rateLimitResponse(limit);
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
  await logActivity({
    actorId: reset.userId,
    action: ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
    entityType: "User",
    entityId: reset.userId,
  });
  if (resetUser) {
    sendPasswordChangedEmail({ recipientId: resetUser.id, to: resetUser.email, userName: resetUser.name }).catch(
      (err: unknown) => console.error("[email] passwordChanged:", err),
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
