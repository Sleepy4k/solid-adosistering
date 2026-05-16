import { A, useSearchParams, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { completePasswordReset } from "~/server/actions/index";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (password().length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password() !== confirm()) {
      setError("Password tidak cocok.");
      return;
    }
    if (!params.token) {
      setError("Token tidak valid.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await completePasswordReset({ token: params.token as string, newPassword: password() });
      navigate("/login");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Token tidak valid atau sudah kedaluwarsa.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta page="resetPassword" />

      <div class="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-100 to-lime-200">
        <div class="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-300/40 blur-3xl" />
        <div class="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-lime-300/40 blur-3xl" />

        <div class="relative z-10 w-full max-w-md px-4">
          <div class="rounded-3xl bg-white/80 p-8 shadow-2xl backdrop-blur-xl">
            <div class="mb-6">
              <h1 class="text-2xl font-bold text-slate-900">Reset Password</h1>
              <p class="mt-1 text-sm text-slate-500">Buat password baru untuk akun Anda.</p>
            </div>

            <Show when={!params.token}>
              <div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                Tautan reset tidak valid.{" "}
                <A href="/forgot-password" class="font-semibold underline">
                  Kirim ulang
                </A>
              </div>
            </Show>

            <Show when={params.token}>
              <>
                <Show when={error()}>
                  <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {error()}
                  </div>
                </Show>
                <form onSubmit={submit} class="flex flex-col gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700" for="pw">
                      Password Baru
                    </label>
                    <div class="relative">
                      <input
                        id="pw"
                        type={showPw() ? "text" : "password"}
                        value={password()}
                        onInput={(e) => setPassword(e.currentTarget.value)}
                        placeholder="Min. 8 karakter"
                        class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <button
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                          <Show
                            when={!showPw()}
                            fallback={
                              <path
                                stroke-linecap="round"
                                d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 4.16-5.595M6.228 6.228A10.015 10.015 0 0 1 12 5c4.478 0 8.268 2.943 9.542 7a10.024 10.024 0 0 1-4.132 5.411M3 3l18 18"
                              />
                            }
                          >
                            <path stroke-linecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                            <path
                              stroke-linecap="round"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </Show>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700" for="pw2">
                      Konfirmasi Password
                    </label>
                    <input
                      id="pw2"
                      type="password"
                      value={confirm()}
                      onInput={(e) => setConfirm(e.currentTarget.value)}
                      placeholder="Ulangi password baru"
                      class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading()}
                    class="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {loading() ? "Menyimpan…" : "Simpan Password"}
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
