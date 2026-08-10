import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { PricingPlans } from "@/components/pricing-plans";
import { UserMenu } from "@/components/user-menu";
import { yearlySavings } from "@/lib/domain/plans";
import { getAuthContext } from "@/lib/server/auth";
import { isStudioPlanConfigured } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "Pricing | Text to Poster",
  description:
    "Creator and Studio credits with clean AI poster exports from Text to Poster.",
};

export default async function PricingPage() {
  const auth = await getAuthContext();
  const studioConfigured = isStudioPlanConfigured();
  const plans = [
    {
      billingPeriod: "monthly",
      eyebrow: "Creator / monthly",
      price: "$9.90",
      cadence: "/ month",
      description:
        "100 credits every month — a flexible starting point for regular poster work.",
      features: [
        "100 credits every month",
        "1K / 2K / 4K output",
        "Medium and High finish",
        "No watermark, private history",
      ],
      plan: "creator_monthly",
      featured: false,
      isConfigured: true,
      originalPrice: null,
      savings: null,
    },
    {
      billingPeriod: "yearly",
      eyebrow: "Creator / yearly",
      price: "$79",
      cadence: "/ year",
      description:
        "100 credits in each monthly window — the lower-cost annual rhythm for individual creators.",
      features: [
        "100 credits in each monthly window",
        "Same full Creator studio access",
        "Credits reset monthly, never roll",
        "Private history and clean downloads",
      ],
      plan: "creator_yearly",
      featured: false,
      isConfigured: true,
      originalPrice: "$118.80",
      savings: yearlySavings(9.9, 79),
    },
    {
      billingPeriod: "monthly",
      eyebrow: "Studio / monthly",
      price: "$19.90",
      cadence: "/ month",
      description:
        "300 credits every month — more room for campaigns, client rounds, and print work.",
      features: [
        "300 credits every month",
        "1K / 2K / 4K output",
        "High finish for final exports",
        "No watermark, private history",
      ],
      plan: "studio_monthly",
      featured: false,
      isConfigured: studioConfigured,
      originalPrice: null,
      savings: null,
    },
    {
      billingPeriod: "yearly",
      eyebrow: "Studio / yearly",
      price: "$169",
      cadence: "/ year",
      description:
        "300 credits in each monthly window — the best value for a high-volume creative practice.",
      features: [
        "300 credits in each monthly window",
        "Same full Studio access",
        "Credits reset monthly, never roll",
        "Priority billing support",
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
      <header className="site-header">
        <Link className="wordmark" href="/">
          <LogoMark className="wordmark-mark" />
          <span>Text to Poster</span>
        </Link>
        <nav className="header-nav">
          <Link href="/#studio">Studio</Link>
          {auth.userId ? (
            <UserMenu
              email={auth.email}
              avatarUrl={auth.avatarUrl}
              tier={auth.tier}
            />
          ) : (
            <Link className="header-cta" href="/login?next=/pricing">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <section className="pricing-intro">
        <p className="eyebrow">Simple, weighted credits</p>
        <h1>Pay for the directions worth keeping.</h1>
        <p>
          Every generation returns four posters. Choose the credit volume that
          fits your practice; annual plans still refresh credits monthly.
        </p>
      </section>
      <PricingPlans
        plans={plans}
        subscriptionState={auth.subscriptionState}
        isSignedIn={Boolean(auth.userId)}
      />
      <p className="pricing-footnote">
        Image engine: GPT Image 2 via APIMart. Outputs are AI-generated and
        should be reviewed before publication. Refunds are eligible within 7
        days only when no credits have been settled.{" "}
        <Link href="/refunds">Read the policy.</Link>
      </p>
    </main>
  );
}
