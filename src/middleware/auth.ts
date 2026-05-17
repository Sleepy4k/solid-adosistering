import { createMiddleware } from "@solidjs/start/middleware";
import { PUBLIC_ROUTES, ROUTES } from "~/constants/routes";
import { prisma } from "~/server/db/prisma";
import { hashToken } from "~/server/security";

function parseCookieHeader(header: string, name: string): string | null {
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === name) return decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return null;
}

export default createMiddleware({
  onRequest: [
    async (event) => {
      const url = new URL(event.request.url);
      const path = url.pathname;

      if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + "/"))) return;
      if (path.startsWith("/_") || path.startsWith("/__") || path.includes(".")) return;

      const cookieName = process.env.SESSION_COOKIE_NAME ?? "adosistering_session";
      const cookieHeader = event.request.headers.get("Cookie") ?? "";
      const token = parseCookieHeader(cookieHeader, cookieName);

      if (!token) {
        return new Response(null, { status: 302, headers: { Location: ROUTES.login } });
      }

      try {
        const tokenHash = hashToken(token);
        const session = await prisma.session.findUnique({
          where: { tokenHash },
          select: { expiresAt: true, user: { select: { isActive: true } } },
        });

        if (!session || session.expiresAt < new Date() || !session.user.isActive) {
          const clear = `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
          return new Response(null, {
            status: 302,
            headers: { Location: ROUTES.login, "Set-Cookie": clear },
          });
        }
      } catch {
        // DB not ready - let route loader handle the error.
      }
    },
  ],
});
