import { A } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { NAV_LINKS } from "~/constants/landing";
import type { WebConfig } from "~/server/actions/index";
import { scrollToId } from "~/features/landing/utils";

type LandingHeaderProps = {
  config: WebConfig;
};

export default function LandingHeader(props: LandingHeaderProps) {
  const [mobileOpen, setMobileOpen] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  onMount(() => {
    const hero = document.getElementById("beranda");
    const updateScroll = () => {
      const threshold = hero ? hero.offsetTop + hero.offsetHeight - 100 : 500;
      setScrolled(window.scrollY > threshold);
    };

    const onDocClick = (event: MouseEvent) => {
      if (!mobileOpen()) return;
      const target = event.target as Node;
      if (!menuRef?.contains(target) && !buttonRef?.contains(target)) {
        setMobileOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("scroll", updateScroll, { passive: true });
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    updateScroll();

    onCleanup(() => {
      window.removeEventListener("scroll", updateScroll);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  const handleNavClick = (e: MouseEvent, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    scrollToId(href);
  };

  return (
    <header id="main-header" class="fixed left-0 right-0 top-0 z-50 transition-all duration-300" role="banner">
      <div class="container mx-auto max-w-screen-xl px-4 pt-5 sm:px-6 lg:px-12 xl:px-16">
        <nav
          id="main-nav"
          aria-label="Navigasi utama"
          class={`flex items-center justify-between rounded-full px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-300 sm:px-6 lg:px-8 ${
            scrolled()
              ? "border border-neutral-700/30 bg-neutral-900/80 backdrop-blur-xl"
              : "border border-white/20 bg-white/15 backdrop-blur-xl"
          }`}
        >
          <a href="#beranda" class="flex shrink-0 items-center gap-2.5" onClick={(e) => handleNavClick(e, "#beranda")}>
            <img
              src={props.config.logoUrl ?? "/landing/logo.svg"}
              alt=""
              class="h-10 w-auto"
              loading="eager"
              decoding="async"
            />
            <span
              class="text-white font-semibold uppercase tracking-wide leading-none"
              style="font-family:'Oswald',sans-serif;font-size:1.25rem;letter-spacing:0.05em"
            >
              {props.config.projectName}
            </span>
          </a>

          <div class="flex items-center gap-3">
            <ul class="hidden items-center gap-1 lg:flex">
              {NAV_LINKS.map((link) => (
                <li>
                  <a
                    href={link.href}
                    class="rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-all duration-200 hover:bg-white/10 hover:text-white"
                    onClick={(e) => handleNavClick(e, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <A
              href="/login"
              class="hidden items-center rounded-full border border-white/70 px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10 lg:inline-flex"
            >
              Masuk
            </A>
            <a
              href="#hubungi-kami"
              class="hidden items-center rounded-full bg-neutral-800/80 px-7 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-900 lg:inline-flex"
              onClick={(e) => handleNavClick(e, "#hubungi-kami")}
            >
              Hubungi Kami
            </a>
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 lg:hidden"
              onClick={(e) => {
                e.stopPropagation();
                setMobileOpen((v) => !v);
              }}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen()}
              aria-controls="landing-mobile-menu"
              ref={(el) => {
                buttonRef = el;
              }}
            >
              <Show
                when={mobileOpen()}
                fallback={
                  <svg
                    class="h-6 w-6 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                }
              >
                <svg
                  class="h-6 w-6 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Show>
            </button>
          </div>
        </nav>
      </div>

      <Show when={mobileOpen()}>
        <div
          id="landing-mobile-menu"
          class="mx-4 mt-2 sm:mx-6"
          ref={(el) => {
            menuRef = el;
          }}
        >
          <div class="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <ul class="space-y-1 px-3 py-3">
              {NAV_LINKS.map((link) => (
                <li>
                  <a
                    href={link.href}
                    class="flex items-center rounded-xl px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
                    onClick={(e) => handleNavClick(e, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#hubungi-kami"
                  class="flex items-center rounded-xl px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
                  onClick={(e) => handleNavClick(e, "#hubungi-kami")}
                >
                  Hubungi Kami
                </a>
              </li>
              <li class="px-1 pt-1 pb-1">
                <A
                  href="/login"
                  class="flex items-center justify-center rounded-xl border border-white/70 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                >
                  Masuk
                </A>
              </li>
            </ul>
          </div>
        </div>
      </Show>
    </header>
  );
}
