import type { APIEvent } from "@solidjs/start/server";
import { siteConfig } from "~/config/site";
import { prisma } from "~/server/db/prisma";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(_event: APIEvent) {
  const origin = siteConfig.url.replace(/\/$/, "");
  const now = new Date().toISOString();
  let lastmod = now;

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "webConfig" },
      select: { updatedAt: true },
    });
    if (setting?.updatedAt) lastmod = setting.updatedAt.toISOString();
  } catch {
    // A sitemap must remain available even when the database is temporarily down.
  }

  const images = [
    { loc: `${origin}${siteConfig.socialImage}`, title: `${siteConfig.name} — ${siteConfig.shortDescription}` },
    { loc: `${origin}/landing/hero-background.webp`, title: "Irigasi tetes cerdas Adosistering" },
    { loc: `${origin}/landing/laptop-mockup.webp`, title: "Dashboard monitoring irigasi Adosistering" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${escapeXml(`${origin}/`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="${siteConfig.language}" href="${escapeXml(`${origin}/`)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${origin}/`)}"/>
${images
  .map(
    (image) => `    <image:image>
      <image:loc>${escapeXml(image.loc)}</image:loc>
      <image:title>${escapeXml(image.title)}</image:title>
    </image:image>`,
  )
  .join("\n")}
  </url>
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
