function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function newsletterTemplate(input: { subject: string; body: string }) {
  const htmlLines = input.body
    .split("\n")
    .map((l) => (l.trim() ? `<p style="margin:0 0 12px">${escapeHtml(l)}</p>` : "<br>"))
    .join("");

  return {
    text: input.body,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto">
        <div style="background:#186D3C;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="font-size:18px;margin:0;color:#fff;font-weight:700">ADOSISTERING</h1>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <h2 style="font-size:20px;margin:0 0 20px;color:#186D3C">${escapeHtml(input.subject)}</h2>
          ${htmlLines}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
          <p style="font-size:12px;color:#9ca3af;margin:0">
            Email ini dikirim oleh tim ADOSISTERING. Jika Anda tidak ingin menerima email ini, silakan hubungi kami.
          </p>
        </div>
      </div>
    `,
  };
}
