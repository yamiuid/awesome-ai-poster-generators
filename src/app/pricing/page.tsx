import type { Metadata } from "next";
import Link from "next/link";
import { PricingAction } from "@/components/pricing-actions";
import { getAuthContext } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Pricing | Text to Poster",
  description: "Pro credits and clean AI poster exports from Text to Poster.",
};

export default async function PricingPage() {
  const auth = await getAuthContext();
  return (
    <main className="pricing-page">
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </Link>
        <nav className="header-nav">
          <Link href="/#studio">Studio</Link>
          {auth.userId ? (
            <Link className="header-cta" href="/account">
              Your history
            </Link>
          ) : (
            <Link className="header-cta" href="/login">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <section className="pricing-intro">
        <p className="eyebrow">Simple, weighted credits</p>
        <h1>Pay for the directions worth keeping.</h1>
        <p>
          Every generation returns four posters. Pro gives you 100 credits each
          billing period, with no rollover and no surprise per-image plans.
        </p>
      </section>
      <section className="plan-grid">
        <article className="plan-card">
          <p className="eyebrow">Monthly</p>
          <h2>
            $9.90 <small>/ month</small>
          </h2>
          <p>Flexible month to month.</p>
          <ul>
            <li>100 credits every month</li>
            <li>1K / 2K / 4K output</li>
            <li>Medium and High finish</li>
            <li>No watermark, private history</li>
          </ul>
          <PricingAction
            plan="monthly"
            isPro={auth.isPro}
            isSignedIn={Boolean(auth.userId)}
          />
        </article>
        <article className="plan-card featured">
          <p className="eyebrow">Yearly / best value</p>
          <h2>
            $59 <small>/ year</small>
          </h2>
          <p>One clean annual commitment.</p>
          <ul>
            <li>100 credits per monthly window</li>
            <li>Same full Pro studio access</li>
            <li>Credits reset monthly, never roll</li>
            <li>Priority support for billing</li>
          </ul>
          <PricingAction
            plan="yearly"
            isPro={auth.isPro}
            isSignedIn={Boolean(auth.userId)}
          />
        </article>
      </section>
      <p className="pricing-footnote">
        Image engine: GPT Image 2 via APIMart. Outputs are AI-generated and
        should be reviewed before publication. Refunds are eligible within 7
        days only when no credits have been settled.{" "}
        <Link href="/refunds">Read the policy.</Link>
      </p>
    </main>
  );
}
