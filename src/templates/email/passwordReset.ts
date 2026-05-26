import { baseEmailTemplate } from "./base";

export function passwordResetTemplate(resetUrl: string) {
  const subject = "Reset Password Adosistering";
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Kami menerima permintaan untuk mereset password akun Adosistering Anda.
      Klik tombol di bawah untuk membuat password baru.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resetUrl}"
         style="display:inline-block;background:#186D3C;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
        Reset Password
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">
      Atau salin tautan berikut ke browser Anda:
    </p>
    <p style="margin:0 0 16px;font-size:12px;color:#186D3C;word-break:break-all">${resetUrl}</p>
    <p style="margin:0;font-size:13px;color:#6b7280">
      Tautan ini berlaku selama <strong>30 menit</strong>. Abaikan email ini jika Anda tidak meminta reset password.
    </p>
  `;
  const bodyText = `Halo,\n\nKami menerima permintaan reset password akun Adosistering Anda.\n\nBuka tautan berikut untuk membuat password baru:\n${resetUrl}\n\nTautan berlaku 30 menit. Abaikan jika Anda tidak meminta reset password.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText });
}
