import { getLocale, getTranslations } from "next-intl/server";
import { PricingPlans } from "@/components/pricing-plans";
import { SiteHeader } from "@/components/site-header";
import {
  CREDIT_PACKS,
  type CreditPackPlan,
  creditsForTier,
  discountPercent,
  yearlyDiscountPercent,
  yearlySavings,
} from "@/lib/domain/plans";
import { isUiLocale } from "@/lib/i18n/locale";
import { pageMeta } from "@/lib/seo";
import { getAuthContext } from "@/lib/server/auth";
import {
  isCreditPackConfigured,
  isScalePlanConfigured,
  isStudioPlanConfigured,
} from "@/lib/server/env";

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

const PACK_NAMES: Readonly<Record<CreditPackPlan, string>> = {
  pack_starter: "Starter",
  pack_standard: "Standard",
  pack_pro: "Pro",
  pack_max: "Max",
};

export default async function PricingPage() {
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("pricing");
  const formatNumber = new Intl.NumberFormat(locale);
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const creatorCredits = formatNumber.format(creditsForTier("creator"));
  const studioCredits = formatNumber.format(creditsForTier("studio"));
  const scaleCredits = formatNumber.format(creditsForTier("scale"));
  const auth = await getAuthContext();
  // 预计可生成图片数：1K/标准品质 = 2 积分/张
  const welcomeImages = formatNumber.format(15);
  const creatorImages = formatNumber.format(250);
  const studioImages = formatNumber.format(500);
  const scaleImages = formatNumber.format(1_500);
  const studioConfigured = isStudioPlanConfigured();
  const scaleConfigured = isScalePlanConfigured();
  const freePlan = {
    kind: "free",
    name: "Free",
    audience: t("freeAudience"),
    price: "$0",
    cadence: t("monthCadence"),
    creditsLabel: t("welcomeCreditsLine"),
    creditsNote: t("creditsNoteOnce", { count: welcomeImages }),
    features: [
      t("freeFeature2"),
      t("freeFeature3"),
      t("freeFeatureReferences"),
      t("freeFeature4"),
    ],
  } as const;
  const paidPlans = [
    {
      kind: "paid",
      billingPeriod: "monthly",
      name: "Creator",
      audience: t("creatorAudience"),
      price: "$9.90",
      cadence: t("monthCadence"),
      yearlyNote: null,
      creditsLabel: t("creditsPerMonth", { credits: creatorCredits }),
      creditsNote: t("creditsNoteMonthly", { count: creatorImages }),
      features: [
        t("outputOptions"),
        t("mediumHighFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("longTermHistory"),
        t("commercialUse"),
      ],
      plan: "creator_monthly",
      featured: false,
      isConfigured: true,
      originalPrice: null,
      savings: null,
      discountPercent: null,
    },
    {
      kind: "paid",
      billingPeriod: "yearly",
      name: "Creator",
      audience: t("creatorAudience"),
      price: "$7.90",
      cadence: t("monthCadence"),
      yearlyNote: t("yearlyNote", {
        yearly: currency.format(94.8),
        savings: currency.format(yearlySavings(9.9, 94.8)),
      }),
      creditsLabel: t("creditsPerMonth", { credits: creatorCredits }),
      creditsNote: t("creditsNoteMonthly", { count: creatorImages }),
      features: [
        t("outputOptions"),
        t("mediumHighFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("monthlyReset"),
        t("longTermHistory"),
        t("commercialUse"),
      ],
      plan: "creator_yearly",
      featured: false,
      isConfigured: true,
      originalPrice: "$9.90",
      savings: yearlySavings(9.9, 94.8),
      discountPercent: yearlyDiscountPercent(9.9, 94.8),
    },
    {
      kind: "paid",
      billingPeriod: "monthly",
      name: "Studio",
      audience: t("studioAudience"),
      price: "$19.90",
      cadence: t("monthCadence"),
      yearlyNote: null,
      creditsLabel: t("creditsPerMonth", { credits: studioCredits }),
      creditsNote: t("creditsNoteMonthly", { count: studioImages }),
      features: [
        t("outputOptions"),
        t("highFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("longTermHistory"),
        t("commercialUse"),
      ],
      plan: "studio_monthly",
      featured: true,
      isConfigured: studioConfigured,
      originalPrice: null,
      savings: null,
      discountPercent: null,
    },
    {
      kind: "paid",
      billingPeriod: "yearly",
      name: "Studio",
      audience: t("studioAudience"),
      price: "$13.90",
      cadence: t("monthCadence"),
      yearlyNote: t("yearlyNote", {
        yearly: currency.format(166.8),
        savings: currency.format(yearlySavings(19.9, 166.8)),
      }),
      creditsLabel: t("creditsPerMonth", { credits: studioCredits }),
      creditsNote: t("creditsNoteMonthly", { count: studioImages }),
      features: [
        t("outputOptions"),
        t("highFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("monthlyReset"),
        t("longTermHistory"),
        t("commercialUse"),
        t("prioritySupport"),
      ],
      plan: "studio_yearly",
      featured: true,
      isConfigured: studioConfigured,
      originalPrice: "$19.90",
      savings: yearlySavings(19.9, 166.8),
      discountPercent: yearlyDiscountPercent(19.9, 166.8),
    },
    {
      kind: "paid",
      billingPeriod: "monthly",
      name: "Scale",
      audience: t("scaleAudience"),
      price: "$49.90",
      cadence: t("monthCadence"),
      yearlyNote: null,
      creditsLabel: t("creditsPerMonth", { credits: scaleCredits }),
      creditsNote: t("creditsNoteMonthly", { count: scaleImages }),
      features: [
        t("outputOptions"),
        t("highFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("longTermHistory"),
        t("commercialUse"),
      ],
      plan: "scale_monthly",
      featured: false,
      isConfigured: scaleConfigured,
      originalPrice: "$59.90",
      savings: Math.round((59.9 - 49.9) * 100) / 100,
      discountPercent: discountPercent(59.9, 49.9),
    },
    {
      kind: "paid",
      billingPeriod: "yearly",
      name: "Scale",
      audience: t("scaleAudience"),
      price: "$35.90",
      cadence: t("monthCadence"),
      yearlyNote: t("yearlyNote", {
        yearly: currency.format(430.8),
        savings: currency.format(yearlySavings(59.9, 430.8)),
      }),
      creditsLabel: t("creditsPerMonth", { credits: scaleCredits }),
      creditsNote: t("creditsNoteMonthly", { count: scaleImages }),
      features: [
        t("outputOptions"),
        t("highFinish"),
        t("noWatermarkHistory"),
        t("upToFiveReferences"),
        t("monthlyReset"),
        t("longTermHistory"),
        t("commercialUse"),
        t("prioritySupport"),
      ],
      plan: "scale_yearly",
      featured: false,
      isConfigured: scaleConfigured,
      originalPrice: "$59.90",
      savings: yearlySavings(59.9, 430.8),
      discountPercent: yearlyDiscountPercent(59.9, 430.8),
    },
  ] as const;
  const packs = Object.values(CREDIT_PACKS).map((pack) => ({
    kind: "pack" as const,
    name: PACK_NAMES[pack.plan],
    audience: t("packAudience"),
    price: currency.format(pack.price),
    cadence: t("packCadence"),
    creditsLabel: t("packCreditsLine", {
      credits: formatNumber.format(pack.credits),
    }),
    creditsNote: t("creditsNoteOnce", {
      count: formatNumber.format(Math.floor(pack.credits / 2)),
    }),
    features: [
      t("packFeatureNoExpiry"),
      t("outputOptions"),
      t("mediumHighFinish"),
      t("packFeatureNoWatermark"),
      t("packFeatureHistory"),
      t("commercialUse"),
    ],
    plan: pack.plan,
    isConfigured: isCreditPackConfigured(pack.plan),
  }));
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
        packs={packs}
        subscriptionState={auth.subscriptionState}
        isSignedIn={Boolean(auth.userId)}
      />
      <section
        className="content-section"
        aria-labelledby="pricing-faq-heading"
      >
        <h2 id="pricing-faq-heading">{t("faqTitle")}</h2>
        <p className="section-intro">{t("faqIntro")}</p>
        <div className="faq-list">
          {(
            [
              [t("faq1Question"), t("faq1Answer")],
              [t("faq2Question"), t("faq2Answer")],
              [t("faq3Question"), t("faq3Answer")],
              [t("faq4Question"), t("faq4Answer")],
              [t("faq5Question"), t("faq5Answer")],
              [t("faq6Question"), t("faq6Answer")],
            ] as const
          ).map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <p className="pricing-footnote">
        {t("footnote")} <a href="/refunds">{t("readRefundPolicy")}</a>
      </p>
    </main>
  );
}
