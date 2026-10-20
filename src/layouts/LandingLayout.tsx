import { Link } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import LandingFooter from "~/features/landing/LandingFooter";
import LandingHeader from "~/features/landing/LandingHeader";
import type { WebConfig } from "~/server/actions/web-config";
import type { SessionUser } from "~/server/auth";

type LandingLayoutProps = {
  config: WebConfig;
  user?: SessionUser | null;
  children: JSX.Element;
};

export default function LandingLayout(props: LandingLayoutProps) {
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
      <Link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      <Link rel="preload" as="font" type="font/woff2" href="/fonts/outfit-latin.woff2" crossorigin="anonymous" />
      <Link rel="preload" as="font" type="font/woff2" href="/fonts/oswald-latin.woff2" crossorigin="anonymous" />
      <Link rel="preload" as="image" href="/landing/hero-background.webp" fetchpriority="high" />
      <a
        href="#konten-utama"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Langsung ke konten utama
      </a>
      <noscript>
        <style>{`.landing-page main.reveal-ready > *{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <LandingHeader config={props.config} user={props.user ?? null} />
      <main id="konten-utama" class="reveal-ready">
        {props.children}
      </main>
      <LandingFooter config={props.config} />
    </div>
  );
}
