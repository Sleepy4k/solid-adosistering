import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";
import { ROUTES } from "~/constants/routes";
import { AuthLayout } from "~/layouts/AuthLayout";

export type NewsletterAction = (input: { token: string }) => Promise<{ ok: boolean }>;

type NewsletterActionStatus = "idle" | "loading" | "success" | "invalid" | "error";

type NewsletterActionPageProps = {
  heading: string;
  intro: string;
  actionLabel: string;
  successHeading: string;
  successMessage: string;
  token: string | null;
  run: NewsletterAction;
  /** Copy shown when the server rejects the token. Defaults to the signup-form hint. */
  invalidHint?: string;
};

const DEFAULT_INVALID_HINT =
  "Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru melalui formulir newsletter di beranda.";

const INVALID_TOKEN_STATUSES = new Set([400, 404, 410]);

function isInvalidTokenError(error: unknown): boolean {
  return error instanceof Response && INVALID_TOKEN_STATUSES.has(error.status);
}

export function NewsletterActionPage(props: NewsletterActionPageProps) {
  const [status, setStatus] = createSignal<NewsletterActionStatus>("idle");

  const badge = () => {
    if (!props.token) return { tone: "warning" as const, label: "Token tidak ditemukan" };
    switch (status()) {
      case "loading":
        return { tone: "info" as const, label: "Memproses" };
      case "success":
        return { tone: "success" as const, label: "Berhasil" };
      case "invalid":
        return { tone: "danger" as const, label: "Tautan tidak valid" };
      case "error":
        return { tone: "danger" as const, label: "Gagal" };
      default:
        return { tone: "muted" as const, label: "Menunggu tindakan" };
    }
  };

  const submit = async (token: string) => {
    if (status() === "loading") return;
    setStatus("loading");
    try {
      await props.run({ token });
      setStatus("success");
    } catch (error) {
      setStatus(isInvalidTokenError(error) ? "invalid" : "error");
    }
  };

  return (
    <AuthLayout>
      <Card class="w-full max-w-[560px] p-7 shadow-xl sm:p-10">
        <header class="mb-6 text-center">
          <div class="mb-4 flex justify-center">
            <Badge tone={badge().tone}>{badge().label}</Badge>
          </div>
          <h1 class="text-2xl font-bold leading-tight text-gray-800 sm:text-3xl">{props.heading}</h1>
          <p class="mt-2 text-sm text-[#4F4F4F]">{props.intro}</p>
        </header>

        <Show
          when={props.token}
          fallback={
            <div class="space-y-5">
              <div role="alert" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Tautan tidak lengkap atau token tidak valid. Silakan gunakan tautan terbaru dari email Anda.
              </div>
              <div class="text-center">
                <A href={ROUTES.landing} class="text-sm font-medium text-[#186D3C] hover:underline">
                  Kembali ke Beranda
                </A>
              </div>
            </div>
          }
        >
          {(token) => (
            <>
              <div aria-live="polite" aria-atomic="true">
                <Show when={status() === "success"}>
                  <div role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                    <p class="text-sm font-semibold text-emerald-900">{props.successHeading}</p>
                    <p class="mt-1 text-sm text-emerald-700">{props.successMessage}</p>
                    <A
                      href={ROUTES.landing}
                      class="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-[#C2C2C2] bg-white px-4 text-sm font-medium text-[#4F4F4F] hover:bg-gray-50"
                    >
                      Kembali ke Beranda
                    </A>
                  </div>
                </Show>

                <Show when={status() === "invalid"}>
                  <div
                    role="alert"
                    class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                  >
                    {props.invalidHint ?? DEFAULT_INVALID_HINT}
                  </div>
                </Show>

                <Show when={status() === "error"}>
                  <div
                    role="alert"
                    class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                  >
                    Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.
                  </div>
                </Show>
              </div>

              <Show when={status() !== "success" && status() !== "invalid"}>
                <Button
                  tone="primary"
                  type="button"
                  class="mt-6 h-12 w-full"
                  disabled={status() === "loading"}
                  aria-busy={status() === "loading"}
                  onClick={() => void submit(token())}
                >
                  {status() === "loading" ? "Memproses..." : props.actionLabel}
                </Button>
                <p class="mt-3 text-center text-xs leading-relaxed text-[#4F4F4F]">
                  Demi keamanan, tindakan hanya dijalankan setelah Anda menekan tombol. Pemindai tautan email tidak akan
                  mengubah data apa pun.
                </p>
              </Show>

              <Show when={status() === "invalid"}>
                <div class="mt-5 text-center">
                  <A href={ROUTES.landing} class="text-sm font-medium text-[#186D3C] hover:underline">
                    Kembali ke Beranda
                  </A>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Card>
    </AuthLayout>
  );
}
