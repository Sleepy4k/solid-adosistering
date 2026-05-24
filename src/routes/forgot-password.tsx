import { A } from "@solidjs/router";
import { createSignal, onCleanup, Show } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { AuthLayout } from "~/layouts/AuthLayout";
import { Field, TextInput } from "~/components/form/Form";
import { Button } from "~/components/ui/Button";
import { requestPasswordReset } from "~/server/actions/index";
import { debounce } from "~/lib/shared/debounce";
import { validateEmail } from "~/lib/shared/validation";
import { useWebConfig } from "~/lib/shared/webConfig";
import fallbackLogo from "~/assets/logo.svg?url";

export default function ForgotPassword() {
  const config = useWebConfig();
  const [email, setEmail] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal("");
  const [emailError, setEmailError] = createSignal("");

  const validateEmailDebounced = debounce((value: string) => setEmailError(validateEmail(value)), 300);
  onCleanup(() => validateEmailDebounced.cancel());

  const onEmailInput = (value: string) => {
    setEmail(value);
    if (emailError()) setEmailError(validateEmail(value));
    else validateEmailDebounced(value);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    validateEmailDebounced.cancel();
    const emailErr = validateEmail(email());
    setEmailError(emailErr);
    if (emailErr) return;

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
      <PageMeta page="forgotPassword" />

      <AuthLayout>
        <section class="w-full max-w-[560px] rounded-3xl border-2 border-white bg-white/75 p-7 shadow-xl backdrop-blur-md sm:p-10">
          <div class="mb-6 text-center">
            <img
              src={config().logoUrl || fallbackLogo}
              alt={config().projectName}
              class="mx-auto mb-4 h-16 w-auto"
              loading="lazy"
              decoding="async"
            />
            <h1 class="text-3xl font-normal leading-tight text-gray-800 sm:text-[40px]">Lupa Password</h1>
            <p class="mt-2 text-sm text-[#4F4F4F]">Masukkan email akun Anda untuk menerima tautan reset password.</p>
          </div>

          <Show
            when={!sent()}
            fallback={
              <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <p class="text-sm font-semibold text-emerald-900">Email terkirim</p>
                <p class="mt-1 text-xs text-emerald-700">Periksa inbox Anda. Tautan berlaku 30 menit.</p>
              </div>
            }
          >
            <>
              <Show when={error()}>
                <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error()}
                </div>
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
                <Button tone="neutral" type="submit" disabled={loading()} class="h-[52px] w-full">
                  {loading() ? "Mengirim..." : "Kirim Tautan Reset"}
                </Button>
              </form>
            </>
          </Show>

          <div class="mt-5 text-center text-sm text-[#4F4F4F]">
            <A href="/login" class="font-medium text-[#186D3C] hover:underline">
              Kembali ke Login
            </A>
          </div>
        </section>
      </AuthLayout>
    </>
  );
}
