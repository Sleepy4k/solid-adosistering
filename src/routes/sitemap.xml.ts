import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";

export function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");
  const now = new Date().toISOString().split("T")[0];

  const pages = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/login", priority: "0.7", changefreq: "yearly" },
    { loc: "/forgot-password", priority: "0.5", changefreq: "yearly" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${origin}${p.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
