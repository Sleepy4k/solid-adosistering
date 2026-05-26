import { baseEmailTemplate } from "./base";

export function loginBlockedTemplate(userName: string, cooldownMinutes: number) {
  const subject = "Peringatan: Percobaan Login Gagal Berulang";
  const now = new Date().toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151">Halo, <strong>${userName}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Sistem mendeteksi beberapa percobaan login yang gagal pada akun Adosistering Anda.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 20px;margin:0 0 16px">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#991b1b">⚠️ Detail Kejadian</p>
      <p style="margin:0;font-size:13px;color:#7f1d1d">Waktu: ${now} WIB</p>
      <p style="margin:0;font-size:13px;color:#7f1d1d">Akun dikunci sementara selama <strong>${cooldownMinutes} menit</strong></p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:#374151">
      Jika ini bukan Anda, kemungkinan ada pihak yang mencoba mengakses akun Anda.
      Segera hubungi administrator untuk bantuan lebih lanjut.
    </p>
    <p style="margin:0;font-size:15px;color:#374151">
      Jika ini adalah Anda, tunggu hingga masa kunci berakhir lalu coba masuk kembali.
    </p>
  `;
  const bodyText = `Halo, ${userName},\n\nSistem mendeteksi percobaan login gagal berulang pada akun Anda.\n\nWaktu: ${now} WIB\nAkun dikunci selama ${cooldownMinutes} menit.\n\nJika ini bukan Anda, segera hubungi administrator.`;

  return baseEmailTemplate({ subject, bodyHtml, bodyText });
}
