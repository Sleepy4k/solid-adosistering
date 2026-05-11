export default function NotConfigured() {
  return (
    <section class="rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h1 class="text-lg font-semibold">Web belum dikonfigurasi</h1>
      <p class="mt-2 text-sm leading-6">
        Lengkapi `.env` dari `.env.example`, set `VITE_APP_CONFIGURED=true`, konfigurasi koneksi MySQL, Firebase, dan
        SMTP sebelum dashboard menampilkan data operasional.
      </p>
    </section>
  );
}
