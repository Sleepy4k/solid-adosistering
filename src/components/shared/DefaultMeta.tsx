import { Meta } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";

export function DefaultMeta() {
  const image = new URL(siteConfig.socialImage, siteConfig.url).toString();

  return (
    <>
      <Meta name="viewport" content="width=device-width, initial-scale=1" />
      <Meta name="application-name" content={publicAppConfig.appName} />
      <Meta name="apple-mobile-web-app-title" content={publicAppConfig.appName} />
      <Meta name="apple-mobile-web-app-capable" content="yes" />
      <Meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <Meta name="mobile-web-app-capable" content="yes" />
      <Meta name="theme-color" content={siteConfig.themeColor} />
      <Meta name="color-scheme" content="light" />
      <Meta name="robots" content="noindex,nofollow" />
      <Meta property="og:site_name" content={publicAppConfig.appName} />
      <Meta property="og:title" content={publicAppConfig.appName} />
      <Meta property="og:type" content="website" />
      <Meta property="og:locale" content={siteConfig.locale} />
      <Meta property="og:description" content={siteConfig.description} />
      <Meta property="og:image" content={image} />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={publicAppConfig.appName} />
      <Meta name="twitter:description" content={siteConfig.description} />
      <Meta name="twitter:image" content={image} />
    </>
  );
}
