import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SubscriptionStatus } from "@/components/subscription-status";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  await resolveRouteLocale(params);
  const t = await getTranslations("checkout");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutSuccessPage({ params }: RouteParams) {
  await resolveRouteLocale(params);
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
