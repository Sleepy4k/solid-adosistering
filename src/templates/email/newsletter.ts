import { baseEmailTemplate, escAttr, escHtml, type EmailBrandConfig } from "./base";

type NewsletterTemplateInput = {
  subject: string;
  body: string;
  config?: Partial<EmailBrandConfig>;
  unsubscribeUrl?: string;
};

export function newsletterTemplate(input: NewsletterTemplateInput) {
  const configuredColor = input.config?.primaryColor;
  const primaryColor = configuredColor && /^#[0-9a-fA-F]{6}$/.test(configuredColor) ? configuredColor : "#186D3C";
  const bodyHtml = input.body
    .split("\n")
    .map((l) => (l.trim() ? `<p style="margin:0 0 12px;font-size:15px;color:#374151">${escHtml(l)}</p>` : "<br>"))
    .join("");

  const unsubscribeHtml = input.unsubscribeUrl
    ? `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280">
          Anda menerima email ini karena terdaftar pada newsletter kami.
          <a href="${escAttr(input.unsubscribeUrl)}" style="color:${primaryColor};text-decoration:underline">
            Berhenti berlangganan
          </a>.
        </p>
      </div>`
    : "";

  const bodyText = input.unsubscribeUrl
    ? `${input.body}\n\n---\nAnda menerima email ini karena terdaftar pada newsletter kami.\nBerhenti berlangganan: ${input.unsubscribeUrl}`
    : input.body;

  return baseEmailTemplate({
    subject: input.subject,
    bodyHtml: `${bodyHtml}${unsubscribeHtml}`,
    bodyText,
    config: input.config,
  });
}

export function newsletterPreviewHtml(input: NewsletterTemplateInput): string {
  return newsletterTemplate(input).html;
}
