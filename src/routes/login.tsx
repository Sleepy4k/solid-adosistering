import { A, query, createAsync, redirect, useNavigate, useSearchParams } from "@solidjs/router";
import { Eye, EyeOff } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { AuthLayout } from "~/layouts/AuthLayout";
import { Button } from "~/components/ui/Button";
import { Field, TextInput } from "~/components/form/Form";
import { login } from "~/server/actions/index";
import { getSession } from "~/server/session";
import { debounce } from "~/lib/shared/debounce";
import { validateEmail, validateRequired } from "~/lib/shared/validation";
import { useWebConfig } from "~/lib/shared/webConfig";
import fallbackLogo from "~/assets/logo.svg?url";

const checkLoginSession = query(async () => {
  "use server";
  const session = await getSession();
  if (session) throw redirect("/dashboard");
  return null;
}, "login-session");

export const route = { preload: () => checkLoginSession() };

export default function Login() {
  createAsync(() => checkLoginSession());

  const config = useWebConfig();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [emailError, setEmailError] = createSignal("");
  const [passwordError, setPasswordError] = createSignal("");
  const [cooldownUntil, setCooldownUntil] = createSignal(0);
  const [nowTs, setNowTs] = createSignal(Date.now());
  const [params] = useSearchParams();
  const navigate = useNavigate();

  onMount(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    onCleanup(() => clearInterval(id));
  });

  const cooldownLeft = () => Math.max(0, Math.ceil((cooldownUntil() - nowTs()) / 1000));

  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const validateEmailDebounced = debounce((value: string) => setEmailError(validateEmail(value)), 300);
  const validatePasswordDebounced = debounce(
    (value: string) => setPasswordError(validateRequired(value, "Password")),
    300,
  );
  onCleanup(() => {
    validateEmailDebounced.cancel();
    validatePasswordDebounced.cancel();
  });

  const onEmailInput = (value: string) => {
    setEmail(value);
    if (emailError()) setEmailError(validateEmail(value));
    else validateEmailDebounced(value);
  };

  const onPasswordInput = (value: string) => {
    setPassword(value);
    if (passwordError()) setPasswordError(validateRequired(value, "Password"));
    else validatePasswordDebounced(value);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (cooldownLeft() > 0) return;
    validateEmailDebounced.cancel();
    validatePasswordDebounced.cancel();

    const emailErr = validateEmail(email());
    const passwordErr = validateRequired(password(), "Password");
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setError("");
    setLoading(true);
    try {
      await login({ email: email(), password: password() });
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof Response) {
        setError(await err.text());
        if (err.status === 429) {
          const retryAfter = Number(err.headers.get("Retry-After"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) setCooldownUntil(Date.now() + retryAfter * 1000);
        }
      } else {
        setError("Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta page="login" />

      <AuthLayout>
        <section class="w-full max-w-[640px] rounded-3xl border-2 border-white bg-white/75 p-7 shadow-xl backdrop-blur-md sm:p-12">
          <div class="mb-6 text-center">
            <img
              src={config().logoUrl || fallbackLogo}
              alt={config().projectName}
              class="mx-auto mb-4 h-16 w-auto"
              loading="lazy"
              decoding="async"
            />
            <h1 class="text-4xl font-normal leading-tight text-gray-800 sm:text-[44px]">Login Akun</h1>
          </div>

          <Show when={params.logout === "1"}>
            <div class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Sesi Anda sudah berakhir.
            </div>
          </Show>

          <Show when={error()}>
            <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error()}</div>
          </Show>

          <form onSubmit={submit} class="flex flex-col gap-6">
            <Field label="Email" for="email" error={emailError()}>
              <TextInput
                id="email"
                type="email"
                autocomplete="email"
                value={email()}
                onInput={(event) => onEmailInput(event.currentTarget.value)}
                onBlur={() => setEmailError(validateEmail(email()))}
                placeholder="Masukkan email"
                aria-invalid={emailError() ? "true" : undefined}
                class={emailError() ? "error" : ""}
              />
            </Field>

            <Field label="Password" for="password" error={passwordError()}>
              <div class="relative">
                <TextInput
                  id="password"
                  type={showPw() ? "text" : "password"}
                  autocomplete="current-password"
                  value={password()}
                  onInput={(event) => onPasswordInput(event.currentTarget.value)}
                  onBlur={() => setPasswordError(validateRequired(password(), "Password"))}
                  placeholder="Masukkan password"
                  aria-invalid={passwordError() ? "true" : undefined}
                  class={`pr-12 ${passwordError() ? "error" : ""}`}
                />
                <button
                  type="button"
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw((value) => !value)}
                  aria-label={showPw() ? "Sembunyikan password" : "Tampilkan password"}
                >
                  <Show when={showPw()} fallback={<Eye size={20} />}>
                    <EyeOff size={20} />
                  </Show>
                </button>
              </div>
            </Field>

            <Button tone="neutral" type="submit" disabled={loading() || cooldownLeft() > 0} class="h-[52px] w-full">
              {cooldownLeft() > 0
                ? `Coba lagi dalam ${formatCountdown(cooldownLeft())}`
                : loading()
                  ? "Memproses..."
                  : "Login"}
            </Button>
          </form>

          <div class="mt-5 flex flex-col items-center gap-3 text-sm text-[#4F4F4F]">
            <A href="/forgot-password" class="font-medium text-[#186D3C] hover:underline">
              Lupa password?
            </A>
            <A href="/" class="text-slate-500 hover:text-slate-700 hover:underline">
              ← Kembali ke Beranda
            </A>
          </div>
        </section>
      </AuthLayout>
    </>
  );
}
