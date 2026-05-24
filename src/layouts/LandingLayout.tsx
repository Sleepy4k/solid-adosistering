import { Link, Meta, Title } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import LandingFooter from "~/features/landing/LandingFooter";
import LandingHeader from "~/features/landing/LandingHeader";
import { siteConfig } from "~/config/site";
import { DEFAULT_WEB_CONFIG } from "~/constants/landing";
import type { WebConfig } from "~/server/actions/index";

type LandingLayoutProps = {
  config: WebConfig;
  children: JSX.Element;
};

export default function LandingLayout(props: LandingLayoutProps) {
  const seoTitle = () => props.config.projectName?.trim() || DEFAULT_WEB_CONFIG.projectName;
  const seoDescription = () => props.config.tagline?.trim() || DEFAULT_WEB_CONFIG.tagline || siteConfig.description;
  const ogImage = () => new URL(props.config.logoUrl?.trim() || siteConfig.socialImage, siteConfig.url).toString();

  onMount(() => {
    document.documentElement.classList.add("landing-scrollbar");
    onCleanup(() => document.documentElement.classList.remove("landing-scrollbar"));

    const main = document.getElementById("konten-utama");
    if (!main) return;

    if (!("IntersectionObserver" in window)) {
      main.classList.remove("reveal-ready");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    for (const child of Array.from(main.children)) observer.observe(child);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="landing-page" style={`--landing-primary:${props.config.primaryColor}`}>
      <Title>{seoTitle()}</Title>
      <Meta name="description" content={seoDescription()} />
      <Meta name="robots" content="index,follow" />
      <Meta property="og:site_name" content={seoTitle()} />
      <Meta property="og:title" content={seoTitle()} />
      <Meta property="og:description" content={seoDescription()} />
      <Meta property="og:url" content={siteConfig.url} />
      <Meta property="og:image" content={ogImage()} />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={seoTitle()} />
      <Meta name="twitter:description" content={seoDescription()} />
      <Meta name="twitter:image" content={ogImage()} />
      <Link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      <Link rel="canonical" href={siteConfig.url} />

      <Link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      <Link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      <Link rel="preconnect" href="https://fonts.googleapis.com" />
      <Link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
      <Link
        rel="preload"
        as="style"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap"
      />
      <Link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap"
      />
      <a
        href="#konten-utama"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Langsung ke konten utama
      </a>
      <noscript>
        <style>{`.landing-page main.reveal-ready > *{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <LandingHeader config={props.config} />
      <main id="konten-utama" class="reveal-ready">
        {props.children}
      </main>
      <LandingFooter config={props.config} />
    </div>
  );
}
