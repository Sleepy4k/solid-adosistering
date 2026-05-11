import { Meta, Title } from "@solidjs/meta";
import { publicAppConfig } from "~/config/public";

export default function PageSeo(props: { title: string; description: string }) {
  const fullTitle = `${props.title} | ${publicAppConfig.appName}`;

  return (
    <>
      <Title>{fullTitle}</Title>
      <Meta name="description" content={props.description} />
      <Meta property="og:title" content={fullTitle} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:type" content="website" />
      <Meta name="twitter:card" content="summary" />
    </>
  );
}
