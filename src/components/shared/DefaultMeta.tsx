import { Link, Meta } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";
import { useWebConfig } from "~/lib/shared/webConfig";

export function DefaultMeta() {
  const config = useWebConfig();
  const brand = () => config().projectName?.trim() || publicAppConfig.appName;
  const favicon = () => config().iconUrl?.trim() || "/favicon.ico";

  return (
    <>
      <Link rel="icon" href={favicon()} />
      <Meta name="viewport" content="width=device-width, initial-scale=1" />
      <Meta name="application-name" content={brand()} />
      <Meta name="apple-mobile-web-app-title" content={brand()} />
      <Meta name="apple-mobile-web-app-capable" content="yes" />
      <Meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <Meta name="mobile-web-app-capable" content="yes" />
      <Meta name="theme-color" content={config().primaryColor || siteConfig.themeColor} />
      <Meta name="color-scheme" content="light" />
      <Meta property="og:type" content="website" />
      <Meta property="og:locale" content={siteConfig.locale} />
    </>
  );
}
