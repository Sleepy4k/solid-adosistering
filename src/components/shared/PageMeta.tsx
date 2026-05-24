import { Link, Meta, Title } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";
import { PAGE_META, type PageMetaKey } from "~/constants/meta";
import { useWebConfig } from "~/lib/shared/webConfig";

type PageMetaProps = {
  page: PageMetaKey;
};

export function PageMeta(props: PageMetaProps) {
  const config = useWebConfig();
  const brand = () => config().projectName?.trim() || publicAppConfig.appName;
  const meta = () => PAGE_META[props.page];
  const title = () => `${meta().title} | ${brand()}`;
  const url = () => new URL(meta().path, siteConfig.url).toString();
  const image = () => new URL(config().logoUrl?.trim() || siteConfig.socialImage, siteConfig.url).toString();

  return (
    <>
      <Title>{title()}</Title>
      <Meta name="description" content={meta().description} />
      <Meta name="keywords" content={meta().keywords} />
      <Meta name="robots" content="noindex,nofollow" />
      <Link rel="canonical" href={url()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={meta().description} />
      <Meta property="og:url" content={url()} />
      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content={brand()} />
      <Meta property="og:locale" content={siteConfig.locale} />
      <Meta property="og:image" content={image()} />
      <Meta property="og:image:alt" content={`${brand()} logo`} />
      <Meta name="twitter:card" content="summary" />
      <Meta name="twitter:title" content={title()} />
      <Meta name="twitter:description" content={meta().description} />
      <Meta name="twitter:image" content={image()} />
      <Meta name="twitter:image:alt" content={`${brand()} logo`} />
    </>
  );
}
