import { baseEmailTemplate, escAttr, escHtml, type EmailBrandConfig } from "./base";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const expiryFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: JAKARTA_TIME_ZONE,
});

function formatExpiry(expiresAt: Date): string {
  if (Number.isNaN(expiresAt.getTime())) return "24 jam";
  return `${expiryFormatter.format(expiresAt)} WIB`;
}

/**
 * Double opt-in confirmation email. The confirmation URL contains the raw
 * bearer token, so the subject stays fixed and every URL is escaped before it
 * is embedded in HTML.
 */
export function newsletterConfirmationTemplate(input: {
  confirmUrl: string;
  expiresAt: Date;
  config?: Partial<EmailBrandConfig>;
}) {
  const configuredColor = input.config?.primaryColor;
  const primaryColor = configuredColor && /^#[0-9a-fA-F]{6}$/.test(configuredColor) ? configuredColor : "#186D3C";
  const projectName = input.config?.projectName?.trim() || "ADOSISTERING";
  const expiresLabel = formatExpiry(input.expiresAt);
  const subject = "Konfirmasi Langganan Newsletter";

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Terima kasih telah mendaftar newsletter <strong>${escHtml(projectName)}</strong>.
      Klik tombol di bawah untuk mengonfirmasi alamat email Anda.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${escAttr(input.confirmUrl)}"
         style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
        Konfirmasi Langganan
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">
      Atau salin tautan berikut ke browser Anda:
    </p>
    <p style="margin:0 0 16px;font-size:12px;color:${primaryColor};word-break:break-all">${escHtml(input.confirmUrl)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280">
      Tautan ini berlaku sampai <strong>${escHtml(expiresLabel)}</strong>.
      Setelah kedaluwarsa, Anda dapat mendaftar kembali melalui situs kami.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280">
      Abaikan email ini jika Anda tidak merasa mendaftar. Alamat email Anda tidak akan
      ditambahkan ke daftar newsletter sebelum konfirmasi.
    </p>
  `;

  const bodyText = `Halo,

Terima kasih telah mendaftar newsletter ${projectName}.

Buka tautan berikut untuk mengonfirmasi alamat email Anda:
${input.confirmUrl}

Tautan ini berlaku sampai ${expiresLabel}. Setelah kedaluwarsa, Anda dapat mendaftar kembali melalui situs kami.

Abaikan email ini jika Anda tidak merasa mendaftar. Alamat email Anda tidak akan ditambahkan ke daftar newsletter sebelum konfirmasi.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText, config: input.config });
}
