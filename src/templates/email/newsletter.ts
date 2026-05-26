import { baseEmailTemplate, escHtml, type EmailBrandConfig } from "./base";

export function newsletterTemplate(input: { subject: string; body: string; config?: Partial<EmailBrandConfig> }) {
  const bodyHtml = input.body
    .split("\n")
    .map((l) => (l.trim() ? `<p style="margin:0 0 12px;font-size:15px;color:#374151">${escHtml(l)}</p>` : "<br>"))
    .join("");

  return baseEmailTemplate({ subject: input.subject, bodyHtml, bodyText: input.body, config: input.config });
}

export function newsletterPreviewHtml(input: {
  subject: string;
  body: string;
  config?: Partial<EmailBrandConfig>;
}): string {
  return newsletterTemplate(input).html;
}
