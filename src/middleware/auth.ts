import { randomBytes, randomUUID } from "node:crypto";
import { createMiddleware } from "@solidjs/start/middleware";
import { getRequestEvent } from "solid-js/web";
import { PROTECTED_ROUTE_PREFIXES, PUBLIC_ROUTES, ROUTES } from "~/constants/routes";
import {
  appOrigin,
  assertServerConfig,
  isProduction,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  serverConfig,
} from "~/server/config";
import { prisma } from "~/server/db/prisma";
import { hashToken } from "~/server/auth/security";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const ASSET_PREFIXES = [
  "/_build/",
  "/assets/",
  "/landing/",
  "/uploads/",
  "/icons/",
  "/fonts/",
  "/favicon",
  "/logo.svg",
  "/og-image",
  "/apple-touch-icon",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/.well-known/",
];

const SUPERADMIN_ROUTES = [
  ROUTES.regionManagement,
  ROUTES.mapConfiguration,
  ROUTES.contactSubmissions,
  ROUTES.superadmin,
];
const ADMIN_ROUTES = [ROUTES.userManagement, ROUTES.systemLog, ROUTES.authLog, ROUTES.adminView];

let serverConfigValidated = false;
function ensureServerConfig() {
  if (serverConfigValidated) return;
  assertServerConfig();
  serverConfigValidated = true;
}

function parseCookieHeader(header: string, name: string): string | null {
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(pair.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isAssetPath(pathname: string) {
  return ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_ROUTES.some((route) => route !== "/" && (pathname === route || pathname.startsWith(route + "/")));
}

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(route + "/");
}

function clearSessionCookieHeader() {
  const secure = isProduction || appOrigin.startsWith("https://");
  return `${serverConfig.sessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function securityHeaders(nonce: string, requestId: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    isProduction
      ? `script-src 'nonce-${nonce}' 'strict-dynamic' https://www.google.com`
      : `script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: ws:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com https://*.tile.openstreetmap.org https://mt1.google.com${isProduction ? "" : " ws: wss:"}`,
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "unsafe-none",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-DNS-Prefetch-Control": "on",
    "X-Request-Id": requestId,
    ...(isProduction ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload" } : {}),
  };
}

function applyHeaders(target: Headers, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) target.set(key, value);
}

/**
 * Responses returned directly from middleware do not always inherit
 * `event.res.headers` from H3, so copy the security headers explicitly.
 */
function respond(event: { res: { headers: Headers } }, body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(event.res.headers);
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return new Response(body, { ...init, headers });
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function hasValidOrigin(req: Request, requestUrl: URL): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return false;

  const isAllowedOrigin = (value: string) => {
    try {
      const origin = new URL(value).origin;
      // In production ONLY the configured public origin is trusted. Comparing
      // against requestUrl.origin would let a forged Host header pass CSRF.
      if (appOrigin && origin === appOrigin) return true;
      return !isProduction && origin === requestUrl.origin;
    } catch {
      return false;
    }
  };

  const origin = req.headers.get("origin");
  if (origin) return isAllowedOrigin(origin);

  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    const parsed = new URL(referer);
    if (parsed.protocol !== "https:" && isProduction) return false;
    return isAllowedOrigin(parsed.origin);
  } catch {
    return false;
  }
}

export default createMiddleware([
  async (event, next) => {
    const requestUrl = new URL(event.req.url);
    const pathname = requestUrl.pathname;
    const requestId = randomUUID();
    const nonce = randomBytes(16).toString("base64");

    event.context.nonce = nonce;
    event.context.requestId = requestId;
    const requestEvent = getRequestEvent();
    if (requestEvent) {
      requestEvent.locals.nonce = nonce;
      requestEvent.locals.requestId = requestId;
    }

    applyHeaders(event.res.headers, securityHeaders(nonce, requestId));
    event.res.headers.set("Vary", "Cookie, Origin");
    event.res.headers.delete("x-powered-by");

    const csrfRejected = !SAFE_METHODS.has(event.req.method) && !hasValidOrigin(event.req, requestUrl);
    if (csrfRejected) {
      return respond(event, "Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    // Server-function RPC and API endpoints enforce authentication themselves so
    // they can return JSON status codes instead of an HTML login redirect.
    if (pathname.startsWith("/_server") || pathname.startsWith("/api/")) return next();

    if (isAssetPath(pathname)) return next();

    if (isPublicPath(pathname)) {
      ensureServerConfig();
      // Personalized landing and auth pages must never be shared by an intermediary cache.
      event.res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
      return next();
    }

    // Let unknown paths reach the catch-all 404 route without requiring login.
    if (!isProtectedPath(pathname)) return next();

    ensureServerConfig();

    const cookieHeader = event.req.headers.get("cookie") ?? "";
    const token = parseCookieHeader(cookieHeader, serverConfig.sessionCookieName);
    if (!token) {
      return respond(event, null, {
        status: 302,
        headers: { Location: ROUTES.login, "Cache-Control": "no-store" },
      });
    }

    try {
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          expiresAt: true,
          absoluteExpiresAt: true,
          lastSeenAt: true,
          createdAt: true,
          user: { select: { isActive: true, role: true } },
        },
      });
      const now = new Date();
      const absoluteExpiry =
        session?.absoluteExpiresAt ??
        (session ? new Date(session.createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000) : null);
      const idleCutoff = new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000);
      const valid =
        session &&
        session.expiresAt > now &&
        absoluteExpiry !== null &&
        absoluteExpiry > now &&
        session.lastSeenAt > idleCutoff &&
        session.user.isActive;

      if (!valid) {
        return respond(event, null, {
          status: 302,
          headers: {
            Location: ROUTES.login,
            "Set-Cookie": clearSessionCookieHeader(),
            "Cache-Control": "no-store",
          },
        });
      }

      if (SUPERADMIN_ROUTES.some((route) => matchesRoute(pathname, route)) && session.user.role !== "SUPERADMIN") {
        return respond(event, null, {
          status: 302,
          headers: { Location: ROUTES.dashboard, "Cache-Control": "no-store" },
        });
      }

      if (ADMIN_ROUTES.some((route) => matchesRoute(pathname, route)) && session.user.role === "USER") {
        return respond(event, null, {
          status: 302,
          headers: { Location: ROUTES.dashboard, "Cache-Control": "no-store" },
        });
      }

      event.res.headers.set("Cache-Control", "private, no-store");
      event.res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return next();
    } catch (error) {
      console.error("[middleware] session validation failed", error);
      return respond(event, "Layanan sedang tidak tersedia.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  },
]);
