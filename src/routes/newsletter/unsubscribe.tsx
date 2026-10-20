import { useSearchParams } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";
import { ROUTES } from "~/constants/routes";
import { NewsletterActionPage } from "~/features/newsletter/NewsletterActionPage";
import { unsubscribeNewsletter } from "~/server/actions/newsletter";

function normalizeToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

export default function NewsletterUnsubscribeRoute() {
  const [params] = useSearchParams();
  const token = () => normalizeToken(params.token);

  return (
    <>
      <PageMeta
        page="home"
        title="Berhenti Berlangganan Newsletter"
        description="Berhenti berlangganan newsletter Adosistering. Perubahan hanya diproses setelah Anda menekan tombol konfirmasi."
        path={ROUTES.newsletterUnsubscribe}
      />
      <NewsletterActionPage
        heading="Berhenti Berlangganan"
        intro="Klik tombol di bawah jika Anda tidak ingin lagi menerima email newsletter dari Adosistering."
        actionLabel="Berhenti Berlangganan"
        successHeading="Berhasil berhenti berlangganan"
        successMessage="Anda tidak akan lagi menerima email newsletter dari Adosistering."
        invalidHint="Tautan berhenti berlangganan tidak valid. Gunakan tautan terbaru dari email Anda."
        token={token()}
        run={unsubscribeNewsletter}
      />
    </>
  );
}
