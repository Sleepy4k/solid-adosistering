import { A } from "@solidjs/router";
import { Title, Meta } from "@solidjs/meta";

export default function NotFound() {
  return (
    <>
      <Title>404 | Adosistering</Title>
      <Meta name="description" content="Halaman tidak ditemukan." />
      <main class="mx-auto grid max-w-md place-items-center px-4 py-20 text-center text-slate-950">
        <section class="rounded-2xl border border-slate-200 bg-white p-8">
          <p class="text-5xl font-bold text-emerald-600">404</p>
          <h1 class="mt-3 text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
          <p class="mt-2 text-sm text-slate-500">Route yang diminta tidak tersedia di aplikasi.</p>
          <A class="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700" href="/">
            Kembali ke Beranda
          </A>
        </section>
      </main>
    </>
  );
}
