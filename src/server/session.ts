import "server-only";
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from "@solidjs/start/http";
import {
  isProduction,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  SESSION_RENEW_WINDOW_SECONDS,
  serverConfig,
} from "./config";
import { prisma } from "./db/prisma";
import { hashToken, newOpaqueToken } from "./security";
import type { Role } from "~/lib/shared/irrigation";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const SESSION_MAX_AGE = SESSION_IDLE_SECONDS;
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60_000;
const MAX_ACTIVE_SESSIONS = 10;

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction || serverConfig.appOrigin.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
});

function requestMetadata() {
  try {
    return {
      ipAddress: getRequestIP({ xForwardedFor: serverConfig.trustProxy }) ?? null,
      userAgent: getRequestHeader("user-agent")?.slice(0, 512) ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const token = getCookie(serverConfig.sessionCookieName);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      absoluteExpiresAt: true,
      createdAt: true,
      lastSeenAt: true,
      user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
    },
  });

  const now = new Date();
  if (!session || session.expiresAt < now || !session.user.isActive) return null;

  const absoluteExpiry =
    session.absoluteExpiresAt ?? new Date(session.createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000);
  if (absoluteExpiry < now) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const idleCutoff = new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000);
  if (session.lastSeenAt < idleCutoff) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const shouldRenew = session.expiresAt.getTime() - now.getTime() < SESSION_RENEW_WINDOW_SECONDS * 1000;
  const shouldTouch = now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_WRITE_INTERVAL_MS;
  if (shouldRenew || shouldTouch) {
    const metadata = shouldTouch ? requestMetadata() : {};
    await prisma.session
      .updateMany({
        where: { id: session.id },
        data: {
          ...(shouldRenew ? { expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000) } : {}),
          lastSeenAt: now,
          ...metadata,
        },
      })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
  };
}

export async function createSession(userId: string): Promise<void> {
  const now = new Date();
  const previousToken = getCookie(serverConfig.sessionCookieName);
  if (previousToken) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } }).catch(() => undefined);
  }

  // Bound the session table and evict the oldest sessions for this account.
  await prisma.session
    .deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }],
      },
    })
    .catch(() => undefined);

  const active = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    // Keep room for the session being created, so the cap is exact.
    skip: MAX_ACTIVE_SESSIONS - 1,
    select: { id: true },
  });
  if (active.length > 0) {
    await prisma.session.deleteMany({ where: { id: { in: active.map((row) => row.id) } } }).catch(() => undefined);
  }

  const token = newOpaqueToken();
  const tokenHash = hashToken(token);
  const metadata = requestMetadata();

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000),
      lastSeenAt: now,
      ...metadata,
    },
  });

  setCookie(serverConfig.sessionCookieName, token, {
    ...cookieOptions(),
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(serverConfig.sessionCookieName);
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => undefined);
  }
  deleteCookie(serverConfig.sessionCookieName, { ...cookieOptions(), maxAge: 0 });
}

/** Invalidate every session for a user, optionally keeping the current one. */
export async function destroyAllUserSessions(userId: string, exceptTokenHash?: string): Promise<void> {
  await prisma.session
    .deleteMany({
      where: {
        userId,
        ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}),
      },
    })
    .catch(() => undefined);
}

export function currentTokenHash(): string | null {
  const token = getCookie(serverConfig.sessionCookieName);
  return token ? hashToken(token) : null;
}
