import { A, cache, createAsync, redirect, useNavigate, useSearchParams } from "@solidjs/router";
import { Eye, EyeOff } from "lucide-solid";
import { createSignal, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { AuthLayout } from "~/layouts/AuthLayout";
import { Button } from "~/components/ui/Button";
import { Field, TextInput } from "~/components/form/Form";
import { login } from "~/server/actions/index";
import { getSession } from "~/server/session";
import logoUrl from "~/assets/logo.svg?url";

const checkLoginSession = cache(async () => {
  "use server";
  const session = await getSession();
  if (session) throw redirect("/dashboard");
  return null;
}, "login-session");

export const route = { preload: () => checkLoginSession() };

export default function Login() {
  createAsync(() => checkLoginSession());

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!email().trim() || !password()) {
      setError("Email dan password wajib diisi.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await login({ email: email(), password: password() });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Response ? await err.text() : "Terjadi kesalahan. Coba lagi.");
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
            <img src={logoUrl} alt="Adosistering" class="mx-auto mb-4 h-16 w-auto" />
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
            <Field label="Email" for="email">
              <TextInput
                id="email"
                type="email"
                autocomplete="email"
                value={email()}
                onInput={(event) => setEmail(event.currentTarget.value)}
                placeholder="Masukkan email"
              />
            </Field>

            <Field label="Password" for="password">
              <div class="relative">
                <TextInput
                  id="password"
                  type={showPw() ? "text" : "password"}
                  autocomplete="current-password"
                  value={password()}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  placeholder="Masukkan password"
                  class="pr-12"
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

            <Button tone="neutral" type="submit" disabled={loading()} class="h-[52px] w-full">
              {loading() ? "Memproses..." : "Login"}
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
