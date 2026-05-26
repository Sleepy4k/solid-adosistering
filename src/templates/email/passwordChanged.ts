import { baseEmailTemplate, type EmailBrandConfig } from "./base";

export function passwordChangedTemplate(userName: string, config?: Partial<EmailBrandConfig>) {
  const subject = "Password Akun Anda Berhasil Diubah";
  const now = new Date().toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo, <strong>${userName}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Password akun Adosistering Anda telah berhasil diubah pada:
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 20px;margin:0 0 16px">
      <p style="margin:0;font-size:14px;font-weight:600;color:#166534">${now} WIB</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Jika Anda tidak melakukan perubahan ini, segera hubungi administrator atau ubah password Anda kembali melalui fitur <em>Lupa Password</em>.
    </p>
  `;
  const bodyText = `Halo, ${userName},\n\nPassword akun Adosistering Anda telah berhasil diubah pada: ${now} WIB.\n\nJika Anda tidak melakukan ini, segera hubungi administrator.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText, config });
}
