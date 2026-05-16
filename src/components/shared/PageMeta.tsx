import { Meta, Title } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";
import { siteConfig } from "~/config/site";
import { PAGE_META, type PageMetaKey } from "~/constants/meta";

type PageMetaProps = {
  page: PageMetaKey;
};

export function PageMeta(props: PageMetaProps) {
  const meta = () => PAGE_META[props.page];
  const title = () => `${meta().title} | ${publicAppConfig.appName}`;
  const url = () => new URL(meta().path, siteConfig.url).toString();
  const image = () => new URL(siteConfig.socialImage, siteConfig.url).toString();

  return (
    <>
      <Title>{title()}</Title>
      <Meta name="description" content={meta().description} />
      <Meta name="keywords" content={meta().keywords} />
      <Meta name="robots" content="noindex,nofollow" />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={meta().description} />
      <Meta property="og:url" content={url()} />
      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content={publicAppConfig.appName} />
      <Meta property="og:locale" content={siteConfig.locale} />
      <Meta property="og:image" content={image()} />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={title()} />
      <Meta name="twitter:description" content={meta().description} />
      <Meta name="twitter:image" content={image()} />
    </>
  );
}
