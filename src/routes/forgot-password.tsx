import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { requestPasswordReset } from "~/server/actions";

export default function ForgotPassword() {
  const [email, setEmail] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!email().trim()) { setError("Email wajib diisi."); return; }
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset({ email: email() });
      setSent(true);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Title>Lupa Password | Adosistering</Title>
      <Meta name="description" content="Kirim tautan reset password ke email Anda." />

      <div class="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-100 to-lime-200">
        <div class="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-300/40 blur-3xl" />
        <div class="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-300/40 blur-3xl" />

        <div class="relative z-10 w-full max-w-md px-4">
          <div class="rounded-3xl bg-white/80 p-8 shadow-2xl backdrop-blur-xl">
            <div class="mb-6">
              <A href="/login" class="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Kembali ke Login
              </A>
              <h1 class="mt-4 text-2xl font-bold text-slate-900">Lupa Password</h1>
              <p class="mt-1 text-sm text-slate-500">
                Masukkan email akun Anda dan kami akan mengirimkan tautan reset password.
              </p>
            </div>

            <Show
              when={!sent()}
              fallback={
                <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <div class="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-100">
                    <svg class="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p class="text-sm font-semibold text-emerald-900">Email terkirim</p>
                  <p class="mt-1 text-xs text-emerald-700">
                    Periksa inbox Anda dan klik tautan reset password. Tautan berlaku 30 menit.
                  </p>
                </div>
              }
            >
              <>
                <Show when={error()}>
                  <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {error()}
                  </div>
                </Show>
                <form onSubmit={submit} class="flex flex-col gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700" for="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={email()}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                      placeholder="Masukkan email"
                      class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading()}
                    class="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {loading() ? "Mengirim…" : "Kirim Tautan Reset"}
                  </button>
                </form>
              </>
            </Show>
          </div>
        </div>
      </div>
    </>
  );
}
