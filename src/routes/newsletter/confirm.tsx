import { useSearchParams } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";
import { ROUTES } from "~/constants/routes";
import { NewsletterActionPage } from "~/features/newsletter/NewsletterActionPage";
import { confirmNewsletterSubscription } from "~/server/actions/newsletter";

function normalizeToken(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

export default function NewsletterConfirmRoute() {
  const [params] = useSearchParams();
  const token = () => normalizeToken(params.token);

  return (
    <>
      <PageMeta
        page="home"
        title="Konfirmasi Langganan Newsletter"
        description="Konfirmasi langganan newsletter Adosistering untuk menerima informasi irigasi tetes dan pembaruan produk."
        path={ROUTES.newsletterConfirm}
      />
      <NewsletterActionPage
        heading="Konfirmasi Langganan"
        intro="Terima kasih telah mendaftar. Klik tombol di bawah untuk mengaktifkan langganan newsletter Adosistering."
        actionLabel="Konfirmasi Langganan"
        successHeading="Langganan berhasil dikonfirmasi"
        successMessage="Anda akan menerima informasi terbaru seputar irigasi tetes dan Adosistering melalui email."
        token={token()}
        run={confirmNewsletterSubscription}
      />
    </>
  );
}
