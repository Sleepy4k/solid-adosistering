import { A } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";

export default function NotFound() {
  return (
    <>
      <PageMeta page="notFound" />
      <main class="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-20 text-center text-slate-950">
        <section class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-2xl font-bold text-emerald-700">
            404
          </div>
          <h1 class="mt-5 text-xl font-semibold text-slate-900">Halaman tidak ditemukan</h1>
          <p class="mt-2 text-sm leading-6 text-slate-500">Route yang diminta tidak tersedia atau sudah dipindahkan.</p>
          <A
            class="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            href="/"
          >
            Kembali ke Beranda
          </A>
        </section>
      </main>
    </>
  );
}
