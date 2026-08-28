import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SubscriptionStatus } from "@/components/subscription-status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutSuccessPage() {
  const t = await getTranslations("checkout");
  return (
    <main className="narrow-page">
      <SiteHeader variant="minimal" />
      <section className="auth-card">
        <p className="eyebrow">{t("paymentReceived")}</p>
        <h1>{t("confirmingStudio")}</h1>
        <p>{t("paymentDescription")}</p>
        <SubscriptionStatus />
      </section>
    </main>
  );
}
