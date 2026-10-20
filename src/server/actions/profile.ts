"use server";

import { ActivityAction } from "@prisma/client";
import { getRequestIP } from "@solidjs/start/http";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendPasswordChangedEmail } from "../integrations/email";
import { hashPassword, verifyPassword } from "../auth/security";
import { serverConfig } from "../config";
import { checkRateLimit, rateLimitResponse } from "../http/rateLimit";
import { changePasswordSchema, parseInput, updateProfileSchema } from "../validation";
import { logActivity } from "../domain";
import { currentTokenHash, destroyAllUserSessions, getSession } from "../auth/session";
import type { MyProfile } from "~/types/profile";

export type { MyProfile };

export async function getMyProfile(): Promise<MyProfile> {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profile: {
        select: {
          whatsapp: true,
          nickname: true,
          gender: true,
          address: true,
          country: true,
          province: true,
          city: true,
          postalCode: true,
          deviceUsername: true,
        },
      },
    },
  });
  return user as MyProfile;
}

export async function updateMyProfile(input: {
  name: string;
  whatsapp?: string;
  gender?: string;
  address?: string;
  country?: string;
  province?: string;
  city?: string;
  postalCode?: string;
}) {
  const data = parseInput(updateProfileSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.id }, data: { name: data.name.trim() } }),
    prisma.userProfile.upsert({
      where: { userId: session.id },
      create: {
        userId: session.id,
        whatsapp: data.whatsapp?.trim() || null,
        gender: data.gender || null,
        address: data.address?.trim() || null,
        country: data.country?.trim() || null,
        province: data.province?.trim() || null,
        city: data.city?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
      },
      update: {
        whatsapp: data.whatsapp?.trim() || null,
        gender: data.gender || null,
        address: data.address?.trim() || null,
        country: data.country?.trim() || null,
        province: data.province?.trim() || null,
        city: data.city?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
      },
    }),
  ]);
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "UserProfile",
    entityId: session.id,
  });
  return { ok: true };
}

export async function changeMyPassword(input: { currentPassword: string; newPassword: string }) {
  const data = parseInput(changePasswordSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");

  let ip = "unknown";
  try {
    ip = getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? "unknown";
  } catch {}
  const limit = checkRateLimit(`password-change:${session.id}:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) throw rateLimitResponse(limit);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  const valid = await verifyPassword(data.currentPassword, user.passwordHash);
  if (!valid) throw new Response("Password saat ini tidak valid", { status: 400 });
  if (data.currentPassword === data.newPassword) {
    throw new Response("Password baru harus berbeda dari password saat ini.", { status: 400 });
  }

  const newHash = await hashPassword(data.newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: session.id }, data: { passwordHash: newHash } });
    // Changing the password invalidates every outstanding reset link.
    await tx.passwordResetToken.updateMany({
      where: { userId: session.id, usedAt: null },
      data: { usedAt: now },
    });
  });
  await destroyAllUserSessions(session.id, currentTokenHash() ?? undefined);
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "UserPassword",
    entityId: session.id,
  });
  sendPasswordChangedEmail({ recipientId: user.id, to: user.email, userName: user.name }).catch((err: unknown) =>
    console.error("[email] passwordChanged:", err),
  );
  return { ok: true };
}
