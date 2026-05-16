import { deleteCookie, getCookie, setCookie } from "@solidjs/start/http";
import { serverConfig } from "./config";
import { prisma } from "./db/prisma";
import { hashToken, newOpaqueToken } from "./security";
import type { Role } from "~/lib/shared/irrigation";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function getSession(): Promise<SessionUser | null> {
  const token = getCookie(serverConfig.sessionCookieName);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = newOpaqueToken();
  const tokenHash = hashToken(token);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    },
  });

  setCookie(serverConfig.sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(serverConfig.sessionCookieName);
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  deleteCookie(serverConfig.sessionCookieName, { path: "/" });
}
