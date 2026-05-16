export function passwordResetTemplate(resetUrl: string) {
  return {
    subject: "Reset password Adosistering",
    text: `Buka tautan ini untuk reset password: ${resetUrl}\n\nTautan berlaku 30 menit.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h1 style="font-size:20px;margin:0 0 12px;color:#186D3C">Reset Password Adosistering</h1>
        <p>Klik tombol berikut untuk membuat password baru.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#67B744;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700">
            Reset Password
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280">Tautan berlaku 30 menit. Abaikan email ini jika Anda tidak meminta reset password.</p>
      </div>
    `,
  };
}
