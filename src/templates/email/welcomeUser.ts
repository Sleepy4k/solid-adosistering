import { baseEmailTemplate, escAttr, escHtml, type EmailBrandConfig } from "./base";

export function welcomeUserTemplate(input: {
  name: string;
  email: string;
  setPasswordUrl: string;
  expiresInHours: number;
  config?: Partial<EmailBrandConfig>;
}) {
  const configuredColor = input.config?.primaryColor;
  const primaryColor = configuredColor && /^#[0-9a-fA-F]{6}$/.test(configuredColor) ? configuredColor : "#186D3C";
  const subject = "Selamat Datang di Adosistering - Atur Kata Sandi Anda";
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo, <strong>${escHtml(input.name)}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Akun Adosistering Anda telah dibuat oleh administrator dengan email
      <strong>${escHtml(input.email)}</strong>. Klik tombol di bawah untuk mengatur kata sandi Anda sebelum masuk.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${escAttr(input.setPasswordUrl)}"
         style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
        Atur Kata Sandi Anda
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Atau salin tautan berikut ke browser Anda:</p>
    <p style="margin:0 0 16px;font-size:12px;color:${primaryColor};word-break:break-all">${escHtml(input.setPasswordUrl)}</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 16px">
      <p style="margin:0;font-size:13px;color:#92400e">
        Tautan ini berlaku selama <strong>${input.expiresInHours} jam</strong> dan hanya dapat digunakan satu kali.
        Jika kedaluwarsa, minta administrator mengirim ulang tautan atau gunakan menu Lupa Password.
      </p>
    </div>
  `;
  const bodyText = `Halo, ${input.name},\n\nAkun Adosistering Anda telah dibuat dengan email ${input.email}.\n\nAtur kata sandi Anda melalui tautan berikut:\n${input.setPasswordUrl}\n\nTautan berlaku ${input.expiresInHours} jam dan hanya dapat digunakan satu kali. Jika kedaluwarsa, minta administrator mengirim ulang tautan.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText, config: input.config });
}
