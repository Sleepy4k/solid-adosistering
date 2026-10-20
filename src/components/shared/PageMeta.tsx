import { Link, Meta, Title } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";
import { PAGE_META, type PageMetaKey } from "~/constants/meta";
import { useWebConfig } from "~/lib/shared/webConfig";

type PageMetaProps = {
  page: PageMetaKey;
  /** Only public, canonical pages should be indexed. App pages default to noindex. */
  indexable?: boolean;
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
};

function absoluteUrl(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl, siteConfig.url).toString();
  } catch {
    return siteConfig.url;
  }
}

function normalizeImageUrl(value: string): string {
  if (!value) return `${siteConfig.url}${siteConfig.socialImage}`;
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return `${siteConfig.url}${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${siteConfig.url}${siteConfig.socialImage}`;
}

export function PageMeta(props: PageMetaProps) {
  const config = useWebConfig();
  const brand = () => config().projectName?.trim() || publicAppConfig.appName;
  const meta = () => PAGE_META[props.page];
  const pageTitle = () => props.title?.trim() || meta().title;
  const title = () => `${pageTitle()} | ${brand()}`;
  const description = () => props.description?.trim() || meta().description;
  const keywords = () => props.keywords?.trim() || meta().keywords;
  const path = () => props.path?.trim() || meta().path;
  const url = () => absoluteUrl(path());
  const image = () => normalizeImageUrl(props.image || siteConfig.socialImage);
  const imageAlt = () => `${brand()} — ${pageTitle()}`;
  const robots = () =>
    props.indexable
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, nofollow, noarchive";

  return (
    <>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta name="keywords" content={keywords()} />
      <Meta name="robots" content={robots()} />
      <Meta name="googlebot" content={robots()} />
      <Meta name="author" content={siteConfig.legalName} />
      <Link rel="canonical" href={url()} />
      <Link rel="alternate" hreflang={siteConfig.language} href={url()} />
      <Link rel="alternate" hreflang="x-default" href={url()} />

      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={url()} />
      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content={brand()} />
      <Meta property="og:locale" content={siteConfig.locale} />
      <Meta property="og:image" content={image()} />
      <Meta property="og:image:url" content={image()} />
      <Meta property="og:image:secure_url" content={image()} />
      <Meta property="og:image:type" content={siteConfig.socialImageType} />
      <Meta property="og:image:width" content={String(siteConfig.socialImageWidth)} />
      <Meta property="og:image:height" content={String(siteConfig.socialImageHeight)} />
      <Meta property="og:image:alt" content={imageAlt()} />

      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={title()} />
      <Meta name="twitter:description" content={description()} />
      <Meta name="twitter:image" content={image()} />
      <Meta name="twitter:image:alt" content={imageAlt()} />
      {siteConfig.twitterHandle ? <Meta name="twitter:site" content={siteConfig.twitterHandle} /> : null}
      {siteConfig.twitterHandle ? <Meta name="twitter:creator" content={siteConfig.twitterHandle} /> : null}
    </>
  );
}
