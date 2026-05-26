"use server";

import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { sendPasswordChangedEmail } from "../email";
import { hashPassword, verifyPassword } from "../security";
import { getSession } from "../session";
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
          apiKey: true,
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
  const session = await getSession();
  if (!session) throw redirect("/login");

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.id }, data: { name: input.name.trim() } }),
    prisma.userProfile.upsert({
      where: { userId: session.id },
      create: {
        userId: session.id,
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        province: input.province?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
      },
      update: {
        whatsapp: input.whatsapp?.trim() || null,
        gender: input.gender || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        province: input.province?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
      },
    }),
  ]);
  return { ok: true };
}

export async function changeMyPassword(input: { currentPassword: string; newPassword: string }) {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new Response("Password saat ini tidak valid", { status: 400 });

  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: session.id }, data: { passwordHash: newHash } });
  sendPasswordChangedEmail({ recipientId: user.id, to: user.email, userName: user.name }).catch(() => {});
  return { ok: true };
}
