// @refresh reload
import { createHandler, StartServer, type DocumentComponentProps, type PageEvent } from "@solidjs/start/server";
import { NoScriptNotice } from "~/components/shared/NoScriptNotice";
import { siteConfig } from "~/config/site";

type StructuredData = Record<string, unknown> | Array<Record<string, unknown>>;

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteConfig.url}/#organization`,
  name: siteConfig.name,
  legalName: siteConfig.legalName,
  url: siteConfig.url,
  logo: {
    "@type": "ImageObject",
    url: `${siteConfig.url}/icons/icon-512.png`,
    width: 512,
    height: 512,
  },
  email: siteConfig.contactEmail,
  foundingDate: siteConfig.foundingDate,
  areaServed: siteConfig.areaServed,
  sameAs: [...siteConfig.sameAs],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteConfig.url}/#website`,
  url: siteConfig.url,
  name: siteConfig.name,
  description: siteConfig.description,
  inLanguage: siteConfig.language,
  publisher: { "@id": `${siteConfig.url}/#organization` },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${siteConfig.url}/#software`,
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Smart Irrigation Management",
  operatingSystem: "Web",
  url: siteConfig.url,
  description: siteConfig.description,
  inLanguage: siteConfig.language,
  featureList: [
    "Monitoring kelembapan tanah real-time",
    "Kontrol sprayer dan pompa jarak jauh",
    "Riwayat dan statistik irigasi",
    "Manajemen region, blok, dan pengguna berbasis peran",
    "Notifikasi dan email transaksional",
  ],
  publisher: { "@id": `${siteConfig.url}/#organization` },
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    priceCurrency: "IDR",
    price: "0",
    description: "Akses dashboard memerlukan akun yang diberikan oleh administrator.",
  },
};

function structuredDataFor(pathname: string): StructuredData {
  if (pathname === "/") return [organizationSchema, websiteSchema, softwareSchema];
  return [organizationSchema, websiteSchema];
}

function Document(
  props: DocumentComponentProps & {
    nonce?: string;
    structuredData: StructuredData;
  },
) {
  const jsonLd = JSON.stringify(props.structuredData).replace(/</g, "\\u003c");

  return (
    <html lang={siteConfig.language} dir="ltr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={siteConfig.themeColor} />
        <meta name="color-scheme" content="light" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://mt1.google.com" crossorigin="anonymous" />
        <link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
        <script type="application/ld+json" nonce={props.nonce} innerHTML={jsonLd} />
        {props.assets}
      </head>
      <body>
        <noscript>
          <NoScriptNotice />
        </noscript>
        <div id="app">{props.children}</div>
        {props.scripts}
      </body>
    </html>
  );
}

function nonceFrom(context: PageEvent): string | undefined {
  return context.locals.nonce ?? (context.nativeEvent as unknown as { context?: { nonce?: string } }).context?.nonce;
}

export default createHandler(
  (context: PageEvent) => {
    const pathname = new URL(context.request.url).pathname;
    const structuredData = structuredDataFor(pathname);
    const nonce = nonceFrom(context);
    return <StartServer document={(props) => <Document {...props} nonce={nonce} structuredData={structuredData} />} />;
  },
  (event: PageEvent) => ({ nonce: nonceFrom(event) }),
);
