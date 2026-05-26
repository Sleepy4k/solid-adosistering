const REPLY_EMAIL = "adosisteringteam@gmail.com";
const YEAR = new Date().getFullYear();

export function baseEmailTemplate(input: { subject: string; bodyHtml: string; bodyText: string }) {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:linear-gradient(135deg,#186D3C 0%,#1e8a4a 100%);padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td>
              <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.05em">
                ADOSISTERING
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75)">
                Sistem Irigasi Cerdas Berbasis IoT untuk Mengoptimalkan Pengairan Lahan Kering
              </p>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#f0fdf4;padding:16px 32px;border-bottom:1px solid #bbf7d0">
        <p style="margin:0;font-size:16px;font-weight:600;color:#166534">${escHtml(input.subject)}</p>
      </div>

      <div style="background:#ffffff;padding:32px">
        ${input.bodyHtml}
      </div>

      <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">
          ⚠️ Email ini dikirim secara otomatis oleh sistem Adosistering - <strong>mohon tidak membalas</strong> email ini.
          Jika Anda memiliki pertanyaan atau membutuhkan bantuan, silakan hubungi kami di
          <a href="mailto:${REPLY_EMAIL}" style="color:#186D3C;text-decoration:none">${REPLY_EMAIL}</a>.
        </p>
      </div>

      <div style="background:#065f46;padding:20px 32px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.9)">
          Salam hangat,<br>
          <strong style="color:#fff">Tim ADOSISTERING</strong>
        </p>
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.5)">
          &copy; ${YEAR} ADOSISTERING. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const text = `${input.subject}\n\n${input.bodyText}\n\n---\nEmail ini dikirim otomatis. Jangan balas email ini.\nUntuk pertanyaan, hubungi: ${REPLY_EMAIL}\n\nSalam hangat,\nTim ADOSISTERING\n© ${YEAR} ADOSISTERING`;

  return { subject: input.subject, html, text };
}

function escHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
