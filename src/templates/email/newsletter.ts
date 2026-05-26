import { baseEmailTemplate } from "./base";

function escHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function newsletterTemplate(input: { subject: string; body: string }) {
  const bodyHtml = input.body
    .split("\n")
    .map((l) => (l.trim() ? `<p style="margin:0 0 12px;font-size:15px;color:#374151">${escHtml(l)}</p>` : "<br>"))
    .join("");

  return baseEmailTemplate({ subject: input.subject, bodyHtml, bodyText: input.body });
}

export function newsletterPreviewHtml(input: { subject: string; body: string }): string {
  return newsletterTemplate(input).html;
}
