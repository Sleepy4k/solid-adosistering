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

      if (path.startsWith("/_") || path.startsWith("/__") || path.includes(".")) return;
      if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + "/"))) return;

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
          select: { expiresAt: true, user: { select: { isActive: true, role: true } } },
        });

        if (!session || session.expiresAt < new Date() || !session.user.isActive) {
          const clear = `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
          return new Response(null, {
            status: 302,
            headers: { Location: ROUTES.login, "Set-Cookie": clear },
          });
        }

        const matchesRoute = (route: string) => path === route || path.startsWith(route + "/");
        const superadminRoutes = [
          ROUTES.regionManagement,
          ROUTES.mapConfiguration,
          ROUTES.contactSubmissions,
          ROUTES.superadmin,
        ];
        const adminRoutes = [ROUTES.userManagement, ROUTES.systemLog, ROUTES.authLog, ROUTES.adminView];

        if (superadminRoutes.some(matchesRoute) && session.user.role !== "SUPERADMIN") {
          return new Response(null, { status: 302, headers: { Location: ROUTES.dashboard } });
        }

        if (adminRoutes.some(matchesRoute) && session.user.role === "USER") {
          return new Response(null, { status: 302, headers: { Location: ROUTES.dashboard } });
        }
      } catch {

      }
    },
  ],
});
