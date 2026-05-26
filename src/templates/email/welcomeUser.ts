import { baseEmailTemplate, type EmailBrandConfig } from "./base";

export function welcomeUserTemplate(input: {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  config?: Partial<EmailBrandConfig>;
}) {
  const primaryColor = input.config?.primaryColor ?? "#186D3C";
  const subject = "Selamat Datang di Adosistering — Akun Anda Telah Dibuat";
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo, <strong>${input.name}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Akun Adosistering Anda telah berhasil dibuat oleh administrator. Berikut adalah kredensial awal Anda:
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 16px">
      <table cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr>
          <td style="font-size:13px;color:#6b7280;width:100px">Email</td>
          <td style="font-size:14px;font-weight:600;color:#166534">${input.email}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280">Password</td>
          <td style="font-size:14px;font-weight:600;color:#166534;font-family:monospace">${input.password}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="${input.loginUrl}"
         style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
        Masuk Sekarang
      </a>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 16px">
      <p style="margin:0;font-size:13px;color:#92400e">
        🔒 Demi keamanan, segera ubah password Anda setelah pertama kali masuk melalui menu <em>Profil → Ubah Password</em>.
      </p>
    </div>
  `;
  const bodyText = `Halo, ${input.name},\n\nAkun Adosistering Anda telah dibuat.\n\nEmail: ${input.email}\nPassword: ${input.password}\n\nLogin di: ${input.loginUrl}\n\nSegera ubah password Anda setelah pertama kali masuk.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText, config: input.config });
}
