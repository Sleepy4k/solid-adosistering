import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";

export function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");

  const content = `User-agent: *
Allow: /
Allow: /login
Allow: /forgot-password
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

Sitemap: ${origin}/sitemap.xml`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
