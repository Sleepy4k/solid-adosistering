import { A, useSearchParams, useNavigate } from "@solidjs/router";
import { createSignal, onCleanup, Show } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { completePasswordReset } from "~/server/actions/index";
import { debounce } from "~/lib/shared/debounce";
import { validateNewPassword, validatePasswordConfirm } from "~/lib/shared/validation";
import { Eye, EyeOff } from "lucide-solid";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [passwordError, setPasswordError] = createSignal("");
  const [confirmError, setConfirmError] = createSignal("");

  const validatePasswordDebounced = debounce((value: string) => setPasswordError(validateNewPassword(value)), 300);
  const validateConfirmDebounced = debounce(
    (pw: string, cf: string) => setConfirmError(validatePasswordConfirm(pw, cf)),
    300,
  );
  onCleanup(() => {
    validatePasswordDebounced.cancel();
    validateConfirmDebounced.cancel();
  });

  const onPasswordInput = (value: string) => {
    setPassword(value);
    if (passwordError()) setPasswordError(validateNewPassword(value));
    else validatePasswordDebounced(value);
    if (confirm() || confirmError()) setConfirmError(validatePasswordConfirm(value, confirm()));
  };

  const onConfirmInput = (value: string) => {
    setConfirm(value);
    if (confirmError()) setConfirmError(validatePasswordConfirm(password(), value));
    else validateConfirmDebounced(password(), value);
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    validatePasswordDebounced.cancel();
    validateConfirmDebounced.cancel();

    const pwErr = validateNewPassword(password());
    const cfErr = validatePasswordConfirm(password(), confirm());
    setPasswordError(pwErr);
    setConfirmError(cfErr);
    if (pwErr || cfErr) return;

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
                        onInput={(e) => onPasswordInput(e.currentTarget.value)}
                        onBlur={() => setPasswordError(validateNewPassword(password()))}
                        placeholder="Min. 8 karakter"
                        aria-invalid={passwordError() ? "true" : undefined}
                        class={`w-full rounded-xl border bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:ring-2 ${
                          passwordError()
                            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                            : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                        }`}
                      />
                      <button
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        onClick={() => setShowPw((v) => !v)}
                      >
                        <Show when={showPw()} fallback={<Eye size={20} />}>
                          <EyeOff size={20} />
                        </Show>
                      </button>
                    </div>
                    <Show when={passwordError()}>
                      <span class="mt-1.5 block text-xs text-rose-600">{passwordError()}</span>
                    </Show>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700" for="pw2">
                      Konfirmasi Password
                    </label>
                    <input
                      id="pw2"
                      type="password"
                      value={confirm()}
                      onInput={(e) => onConfirmInput(e.currentTarget.value)}
                      onBlur={() => setConfirmError(validatePasswordConfirm(password(), confirm()))}
                      placeholder="Ulangi password baru"
                      aria-invalid={confirmError() ? "true" : undefined}
                      class={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:ring-2 ${
                        confirmError()
                          ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                          : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      }`}
                    />
                    <Show when={confirmError()}>
                      <span class="mt-1.5 block text-xs text-rose-600">{confirmError()}</span>
                    </Show>
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
