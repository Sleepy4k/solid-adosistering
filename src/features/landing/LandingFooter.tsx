import { createSignal } from "solid-js";
import { CONTACT_INFO, FOOTER_LINKS, LANDING_DESCRIPTION, SOCIAL_LINKS } from "~/constants/landing";
import type { WebConfig } from "~/server/actions/index";

type LandingFooterProps = {
  config: WebConfig;
};

function SocialIcon(props: { type: "instagram" | "youtube" | "tiktok" }) {
  if (props.type === "instagram") {
    return (
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }

  if (props.type === "tiktok") {
    return (
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.69a8.24 8.24 0 0 0 4.76 1.5v-3.5a4.85 4.85 0 0 1-1-.11z" />
      </svg>
    );
  }

  return (
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

export default function LandingFooter(props: LandingFooterProps) {
  const year = new Date().getFullYear();
  const [newsletterEmail, setNewsletterEmail] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const submitNewsletter = (event: SubmitEvent) => {
    event.preventDefault();
    const value = newsletterEmail().trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      inputRef?.focus();
      return;
    }
    const subject = encodeURIComponent("Berlangganan informasi ADOSISTERING");
    const body = encodeURIComponent(
      `Halo tim ADOSISTERING,\n\nSaya ingin berlangganan informasi terkini.\nEmail saya: ${value}\n\nTerima kasih.`,
    );
    window.location.href = `mailto:${CONTACT_INFO.email}?subject=${subject}&body=${body}`;
  };

  return (
    <footer class="bg-[#1a2e1a] text-white">
      <div class="container mx-auto max-w-screen-xl px-4 pb-14 pt-16 sm:px-6 lg:px-12 xl:px-16 md:pt-20">
        <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <h2 class="text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl lg:text-[3.5rem]">
            Mari Terhubung &amp;<br />Berkolaborasi
          </h2>
          <div class="lg:text-right">
            <p class="mb-4 text-sm font-semibold text-white sm:text-base">Dapatkan Informasi Terkini</p>
            <form class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center" noValidate onSubmit={submitNewsletter}>
              <input
                ref={inputRef}
                type="email"
                value={newsletterEmail()}
                onInput={(event) => setNewsletterEmail(event.currentTarget.value)}
                placeholder="Masukkan email"
                autocomplete="email"
                aria-label="Alamat email untuk berlangganan informasi"
                class="h-12 flex-1 rounded-full border border-[#3a5a3a] bg-[#2a3f2a] px-6 text-sm text-white placeholder:text-white/50 focus:border-[#67b744] focus:outline-none"
              />
              <button
                type="submit"
                class="h-12 whitespace-nowrap rounded-full bg-amber-400 px-8 text-sm font-semibold text-neutral-900 transition-colors duration-200 hover:bg-amber-300"
              >
                Kirim Email
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="border-t border-white/10" />
      </div>

      <div class="container mx-auto max-w-screen-xl px-4 pb-10 pt-10 sm:px-6 lg:px-12 xl:px-16 md:pt-14">
        <div class="grid gap-10 md:grid-cols-2 lg:grid-cols-[2fr_1fr_2fr] lg:gap-12">
          <div>
            <div class="mb-6 inline-flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5">
              <img src={props.config.logoUrl ?? "/landing/logo.svg"} alt="" class="h-9 w-auto" />
              <span
                class="font-semibold leading-none text-neutral-900"
                style="font-family:'Oswald',sans-serif;font-size:1.15rem;letter-spacing:0.05em"
              >
                {props.config.projectName}
              </span>
            </div>
            <p class="mb-6 max-w-md text-sm leading-relaxed text-white/60">{LANDING_DESCRIPTION}</p>
            <div class="mb-8 flex items-center gap-3">
              {SOCIAL_LINKS.map((link) => (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
                  aria-label={link.label}
                >
                  <SocialIcon type={link.icon} />
                </a>
              ))}
            </div>
            <p class="text-xs text-white/40">&copy; {year} {props.config.projectName}. All Right Reserved</p>
          </div>

          <div>
            <h3 class="mb-5 text-base font-bold">Tentang Kami</h3>
            <ul class="space-y-3">
              {FOOTER_LINKS.map((link) => (
                <li>
                  <a href={link.href} class="text-sm text-white/60 transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div class="space-y-6">
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Telepon</p>
                <p class="text-sm text-white/60">{CONTACT_INFO.phone}</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Email</p>
                <p class="text-sm text-white/60">{CONTACT_INFO.email}</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <svg
                class="mt-0.5 h-5 w-5 shrink-0 text-white/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <div>
                <p class="mb-0.5 text-sm font-semibold text-amber-400">Alamat</p>
                <p class="text-sm leading-relaxed text-white/60">{CONTACT_INFO.address}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
