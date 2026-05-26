const REPLY_EMAIL = "adosisteringteam@gmail.com";
const YEAR = new Date().getFullYear();

export type EmailBrandConfig = {
  projectName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
};

const DEFAULT_BRAND: EmailBrandConfig = {
  projectName: "ADOSISTERING",
  tagline: "Sistem Irigasi Cerdas Berbasis IoT",
  logoUrl: null,
  primaryColor: "#186D3C",
};

function hexShade(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  if (factor > 0) {
    return `#${toHex(r + (255 - r) * factor)}${toHex(g + (255 - g) * factor)}${toHex(b + (255 - b) * factor)}`;
  }
  const f = 1 + factor;
  return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
}

export function baseEmailTemplate(input: {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  config?: Partial<EmailBrandConfig>;
}) {
  const cfg: EmailBrandConfig = { ...DEFAULT_BRAND, ...input.config };
  const headerStart = cfg.primaryColor;
  const headerEnd = hexShade(cfg.primaryColor, -0.15);
  const footerBg = hexShade(cfg.primaryColor, -0.45);
  const subjectBg = hexShade(cfg.primaryColor, 0.92);
  const subjectBorder = hexShade(cfg.primaryColor, 0.6);
  const subjectText = hexShade(cfg.primaryColor, -0.15);

  const logoHtml = cfg.logoUrl
    ? `<img src="${cfg.logoUrl}" alt="${escHtml(cfg.projectName)}" style="display:block;height:44px;max-width:180px;object-fit:contain;margin-bottom:10px" />`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,${headerStart} 0%,${headerEnd} 100%);padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td>
              ${logoHtml}
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.05em">
                ${escHtml(cfg.projectName.toUpperCase())}
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75)">
                ${escHtml(cfg.tagline)}
              </p>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:${subjectBg};padding:16px 32px;border-bottom:1px solid ${subjectBorder}">
        <p style="margin:0;font-size:16px;font-weight:600;color:${subjectText}">${escHtml(input.subject)}</p>
      </div>

      <div style="background:#ffffff;padding:32px">
        ${input.bodyHtml}
      </div>

      <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">
          ⚠️ Email ini dikirim secara otomatis oleh sistem ${escHtml(cfg.projectName)} - <strong>mohon tidak membalas</strong> email ini.
          Jika Anda memiliki pertanyaan atau membutuhkan bantuan, silakan hubungi kami di
          <a href="mailto:${REPLY_EMAIL}" style="color:${cfg.primaryColor};text-decoration:none">${REPLY_EMAIL}</a>.
        </p>
      </div>

      <div style="background:${footerBg};padding:20px 32px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.9)">
          Salam hangat,<br>
          <strong style="color:#fff">Tim ${escHtml(cfg.projectName.toUpperCase())}</strong>
        </p>
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.5)">
          &copy; ${YEAR} ${escHtml(cfg.projectName.toUpperCase())}. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const text = `${input.subject}\n\n${input.bodyText}\n\n---\nEmail ini dikirim otomatis. Jangan balas email ini.\nUntuk pertanyaan, hubungi: ${REPLY_EMAIL}\n\nSalam hangat,\nTim ${cfg.projectName.toUpperCase()}\n© ${YEAR} ${cfg.projectName.toUpperCase()}`;

  return { subject: input.subject, html, text };
}

export function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
