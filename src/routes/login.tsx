import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Meta, Title } from "@solidjs/meta";
import { login } from "~/server/actions";
import { useToast } from "~/components/ToastProvider";

export default function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!email().trim() || !password()) { setError("Email dan password wajib diisi."); return; }
    setError("");
    setLoading(true);
    try {
      await login({ email: email(), password: password() });
      navigate("/");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Terjadi kesalahan. Coba lagi.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Title>Login | Adosistering</Title>
      <Meta name="description" content="Login ke dashboard Adosistering IoT Irrigation." />

      <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-100 to-lime-200">
        {/* Decorative circles */}
        <div class="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-300/40 blur-3xl" />
        <div class="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-300/40 blur-3xl" />
        <div class="absolute bottom-1/3 right-1/4 h-48 w-48 rounded-full bg-teal-400/30 blur-2xl" />

        <div class="relative z-10 w-full max-w-md px-4">
          <div class="rounded-3xl bg-white/80 p-8 shadow-2xl backdrop-blur-xl">
            {/* Logo */}
            <div class="mb-6 flex flex-col items-center gap-2">
              <div class="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 shadow-lg">
                <svg class="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
                </svg>
              </div>
              <h1 class="text-2xl font-bold text-slate-900">Login Akun</h1>
            </div>

            {/* Logout success notice */}
            <Show when={params.logout === "1"}>
              <div class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                You have been logged out.
              </div>
            </Show>

            {/* Error */}
            <Show when={error()}>
              <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error()}
              </div>
            </Show>

            <form onSubmit={submit} class="flex flex-col gap-4">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700" for="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autocomplete="email"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="Masukkan email"
                  class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700" for="password">
                  Password
                </label>
                <div class="relative">
                  <input
                    id="password"
                    type={showPw() ? "text" : "password"}
                    autocomplete="current-password"
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    placeholder="Masukkan password"
                    class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw() ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <Show
                      when={showPw()}
                      fallback={
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                          <path stroke-linecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                          <path stroke-linecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      }
                    >
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 4.16-5.595M6.228 6.228A10.015 10.015 0 0 1 12 5c4.478 0 8.268 2.943 9.542 7a10.024 10.024 0 0 1-4.132 5.411M3 3l18 18" />
                      </svg>
                    </Show>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading()}
                class="mt-1 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading() ? "Memproses…" : "Login"}
              </button>
            </form>

            <div class="mt-5 text-center text-sm text-slate-500">
              <A href="/forgot-password" class="font-medium text-emerald-600 hover:underline">
                Lupa password?
              </A>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
