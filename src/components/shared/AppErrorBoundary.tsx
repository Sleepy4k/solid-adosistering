import type { JSX } from "solid-js";
import { Button } from "~/components/ui/Button";

function messageFromError(error: unknown) {
  if (error instanceof Response) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "Koneksi ke server atau Firebase sedang bermasalah.";
}

function statusFromError(error: unknown) {
  if (error instanceof Response) return error.status;
  return 500;
}

function titleFromStatus(status: number) {
  if (status === 400) return "Permintaan tidak valid";
  if (status === 401) return "Sesi perlu login ulang";
  if (status === 403) return "Akses ditolak";
  if (status === 404) return "Data tidak ditemukan";
  if (status >= 500) return "Server sedang bermasalah";
  return "Data belum bisa dimuat";
}

export function AppErrorFallback(props: { error: unknown; reset: () => void }) {
  const message = () => messageFromError(props.error);
  const status = () => statusFromError(props.error);

  return (
    <section class="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center px-4 py-12">
      <div class="w-full rounded-2xl border border-red-100 bg-white p-7 text-center shadow-sm">
        <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-xl font-bold text-red-600">
          {status()}
        </div>
        <h1 class="text-lg font-bold text-[#4F4F4F]">{titleFromStatus(status())}</h1>
        <p class="mt-2 text-sm leading-6 text-[#6B6B6B]">{message()}</p>
        <div class="mt-5 flex justify-center">
          <Button type="button" tone="neutral" onClick={props.reset}>
            Coba lagi
          </Button>
        </div>
      </div>
    </section>
  );
}

export function InlineError(props: { title?: string; message?: JSX.Element | string }) {
  return (
    <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span class="font-semibold">{props.title ?? "Koneksi gagal"}</span>
      <span class="ml-1">{props.message ?? "Data realtime belum tersedia. Tampilan tetap bisa digunakan."}</span>
    </div>
  );
}
