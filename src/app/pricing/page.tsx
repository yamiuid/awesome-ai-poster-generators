import { getLocale, getTranslations } from "next-intl/server";
import { PricingPlans } from "@/components/pricing-plans";
import { SiteHeader } from "@/components/site-header";
import { creditsForTier, yearlySavings } from "@/lib/domain/plans";
import { isUiLocale } from "@/lib/i18n/locale";
import { pageMeta } from "@/lib/seo";
import { getAuthContext } from "@/lib/server/auth";
import { isStudioPlanConfigured } from "@/lib/server/env";

export async function generateMetadata() {
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("pricing");
  return pageMeta({
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    path: "/pricing",
    locale,
  });
}

export default async function PricingPage() {
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("pricing");
  const formatNumber = new Intl.NumberFormat(locale);
  const creatorCredits = formatNumber.format(creditsForTier("creator"));
  const studioCredits = formatNumber.format(creditsForTier("studio"));
  const auth = await getAuthContext();
  const studioConfigured = isStudioPlanConfigured();
  const freePlan = {
    kind: "free",
    eyebrow: t("freeEyebrow"),
    price: "$0",
    cadence: t("freeCadence"),
    description: t("freeDescription"),
    features: [
      t("freeFeature1"),
      t("freeFeature2"),
      t("freeFeature3"),
      t("freeFeature4"),
    ],
  } as const;
  const paidPlans = [
    {
      kind: "paid",
      billingPeriod: "monthly",
      eyebrow: t("creatorMonthlyEyebrow"),
      price: "$9.90",
      cadence: t("monthCadence"),
      description: t("creatorMonthlyDescription", { credits: creatorCredits }),
      features: [
        t("monthlyCredits", { credits: creatorCredits }),
        t("outputOptions"),
        t("mediumHighFinish"),
        t("noWatermarkHistory"),
      ],
      plan: "creator_monthly",
      featured: false,
      isConfigured: true,
      originalPrice: null,
      savings: null,
    },
    {
      kind: "paid",
      billingPeriod: "yearly",
      eyebrow: t("creatorYearlyEyebrow"),
      price: "$79",
      cadence: t("yearCadence"),
      description: t("creatorYearlyDescription", { credits: creatorCredits }),
      features: [
        t("monthlyWindowCredits", { credits: creatorCredits }),
        t("fullCreatorAccess"),
        t("monthlyReset"),
        t("noWatermarkHistory"),
      ],
      plan: "creator_yearly",
      featured: false,
      isConfigured: true,
      originalPrice: "$118.80",
      savings: yearlySavings(9.9, 79),
    },
    {
      kind: "paid",
      billingPeriod: "monthly",
      eyebrow: t("studioMonthlyEyebrow"),
      price: "$19.90",
      cadence: t("monthCadence"),
      description: t("studioMonthlyDescription", { credits: studioCredits }),
      features: [
        t("monthlyCredits", { credits: studioCredits }),
        t("outputOptions"),
        t("highFinish"),
        t("noWatermarkHistory"),
      ],
      plan: "studio_monthly",
      featured: false,
      isConfigured: studioConfigured,
      originalPrice: null,
      savings: null,
    },
    {
      kind: "paid",
      billingPeriod: "yearly",
      eyebrow: t("studioYearlyEyebrow"),
      price: "$169",
      cadence: t("yearCadence"),
      description: t("studioYearlyDescription", { credits: studioCredits }),
      features: [
        t("monthlyWindowCredits", { credits: studioCredits }),
        t("fullStudioAccess"),
        t("monthlyReset"),
        t("prioritySupport"),
      ],
      plan: "studio_yearly",
      featured: false,
      isConfigured: studioConfigured,
      originalPrice: "$238.80",
      savings: yearlySavings(19.9, 169),
    },
  ] as const;
  return (
    <main className="pricing-page">
      <SiteHeader initialAuth={auth} />
      <section className="pricing-intro">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("heading")}</h1>
        <p>{t("intro")}</p>
      </section>
      <PricingPlans
        freePlan={freePlan}
        plans={paidPlans}
        subscriptionState={auth.subscriptionState}
        isSignedIn={Boolean(auth.userId)}
      />
      <p className="pricing-footnote">
        {t("footnote")} <a href="/refunds">{t("readRefundPolicy")}</a>
      </p>
    </main>
  );
}
