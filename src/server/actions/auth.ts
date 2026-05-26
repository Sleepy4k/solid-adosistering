"use server";

import { ActivityAction } from "@prisma/client";
import { prisma } from "../db/prisma";
import { sendLoginBlockedEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "../email";
import { serverConfig } from "../config";
import { checkLoginThrottle, clearLoginThrottle, registerLoginFailure } from "../loginRateLimit";
import { hashPassword, hashToken, newOpaqueToken, verifyPassword } from "../security";
import { createSession, destroySession, getSession } from "../session";
import { cooldownResponse, invalidCredentialsResponse, logActivity } from "./_helpers";

export async function login(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();

  const throttle = checkLoginThrottle(email);
  if (throttle.blocked) throw cooldownResponse(throttle.retryAfterSec);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
  });

  if (!user) {
    const result = registerLoginFailure(email);
    throw result.blocked ? cooldownResponse(result.retryAfterSec) : invalidCredentialsResponse(result.remaining);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const result = registerLoginFailure(email);
    if (result.blocked) {
      const mins = Math.ceil(result.retryAfterSec / 60);
      sendLoginBlockedEmail({ recipientId: user.id, to: user.email, userName: user.name, cooldownMinutes: mins }).catch(
        () => {},
      );
      throw cooldownResponse(result.retryAfterSec);
    }
    throw invalidCredentialsResponse(result.remaining);
  }

  clearLoginThrottle(email);

  if (!user.isActive) {
    throw new Response("Akun Anda telah dinonaktifkan. Hubungi administrator untuk informasi lebih lanjut.", {
      status: 403,
    });
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
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user) return { ok: true };

  const token = newOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
  });

  const resetUrl = `${serverConfig.appOrigin}/reset-password?token=${token}`;
  await sendPasswordResetEmail({ recipientId: user.id, to: user.email, resetUrl });
  await logActivity({
    actorId: user.id,
    action: ActivityAction.AUTH_PASSWORD_RESET_REQUEST,
    entityType: "User",
    entityId: user.id,
  });
  return { ok: true };
}

export async function completePasswordReset(input: { token: string; newPassword: string }) {
  const tokenHash = hashToken(input.token);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    throw new Response("Token tidak valid atau sudah kedaluwarsa", { status: 400 });

  const resetUser = await prisma.user.findUnique({
    where: { id: reset.userId },
    select: { id: true, name: true, email: true },
  });
  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: newHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await logActivity({
    actorId: reset.userId,
    action: ActivityAction.AUTH_PASSWORD_RESET_COMPLETE,
    entityType: "User",
    entityId: reset.userId,
  });
  if (resetUser) {
    sendPasswordChangedEmail({ recipientId: resetUser.id, to: resetUser.email, userName: resetUser.name }).catch(
      () => {},
    );
  }
  return { ok: true };
}
