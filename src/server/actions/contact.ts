"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";

export async function saveContactSubmission(input: {
  name: string;
  email: string;
  phone?: string;
  userType?: string;
  message: string;
}) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim();
  if (!name || !email || !message) {
    throw new Response("Nama, email, dan pesan wajib diisi.", { status: 400 });
  }
  await prisma.contactSubmission.create({
    data: {
      id: randomBytes(10).toString("hex"),
      name,
      email,
      phone: input.phone?.trim() || null,
      userType: input.userType?.trim() || null,
      message,
    },
  });
  return { ok: true };
}

export async function getContactSubmissions(input?: { unreadOnly?: boolean }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  return prisma.contactSubmission.findMany({
    where: input?.unreadOnly ? { isRead: false } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function markContactRead(input: { id: string; isRead: boolean }) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.contactSubmission.update({ where: { id: input.id }, data: { isRead: input.isRead } });
  return { ok: true };
}
