import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";

export function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");

  const content = `User-agent: *
Allow: /$
Allow: /landing/
Allow: /icons/
Allow: /favicon.ico
Allow: /og-image.png
Allow: /site.webmanifest
Allow: /sitemap.xml
Allow: /robots.txt
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /.well-known/security.txt
Disallow: /_server/
Disallow: /_build/
Disallow: /api/
Disallow: /uploads/
Disallow: /login
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /dashboard
Disallow: /irrigation-history
Disallow: /statistics
Disallow: /user-management
Disallow: /region-management
Disallow: /map-configuration
Disallow: /system-log
Disallow: /auth-log
Disallow: /contact-submissions
Disallow: /settings
Disallow: /profile
Disallow: /help-center
Disallow: /superadmin
Disallow: /admin-view
Disallow: /404

Sitemap: ${origin}/sitemap.xml
Host: ${origin}
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
