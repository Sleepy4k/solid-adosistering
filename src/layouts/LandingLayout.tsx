import { Link } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import LandingFooter from "~/features/landing/LandingFooter";
import LandingHeader from "~/features/landing/LandingHeader";
import type { WebConfig } from "~/server/actions/index";

type LandingLayoutProps = {
  config: WebConfig;
  children: JSX.Element;
};

export default function LandingLayout(props: LandingLayoutProps) {
  onMount(() => {
    document.documentElement.classList.add("landing-scrollbar");
    onCleanup(() => document.documentElement.classList.remove("landing-scrollbar"));
  });

  return (
    <div class="landing-page" style={`--landing-primary:${props.config.primaryColor}`}>
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
      <LandingHeader config={props.config} />
      <main id="konten-utama">{props.children}</main>
      <LandingFooter config={props.config} />
    </div>
  );
}
