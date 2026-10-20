import { Link, Meta } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";
import { useWebConfig } from "~/lib/shared/webConfig";

function safeBrandAsset(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fallback;
}

export function DefaultMeta() {
  const config = useWebConfig();
  const brand = () => config().projectName?.trim() || publicAppConfig.appName;
  const favicon = () => safeBrandAsset(config().iconUrl, "/favicon.ico");
  const themeColor = () => config().primaryColor || siteConfig.themeColor;

  return (
    <>
      <Link rel="icon" href={favicon()} />
      <Meta name="application-name" content={brand()} />
      <Meta name="apple-mobile-web-app-title" content={brand()} />
      <Meta name="apple-mobile-web-app-capable" content="yes" />
      <Meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <Meta name="mobile-web-app-capable" content="yes" />
      <Meta name="msapplication-TileColor" content={themeColor()} />
      <Meta name="theme-color" content={themeColor()} />
      <Meta name="color-scheme" content="light" />
    </>
  );
}
