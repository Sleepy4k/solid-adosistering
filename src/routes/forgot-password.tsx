import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { AuthLayout } from "~/layouts/AuthLayout";
import { Field, TextInput } from "~/components/form/Form";
import { Button } from "~/components/ui/Button";
import { requestPasswordReset } from "~/server/actions/index";
import logoUrl from "~/assets/logo.svg";

export default function ForgotPassword() {
  const [email, setEmail] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!email().trim()) {
      setError("Email wajib diisi.");
      return;
    }
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
            <img src={logoUrl} alt="Adosistering" class="mx-auto mb-4 h-16 w-auto" />
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
