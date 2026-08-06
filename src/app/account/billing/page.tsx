import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button";
import { UserMenu } from "@/components/user-menu";
import { getAuthContext } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = {
  title: "Billing | Text to Poster",
  robots: { index: false, follow: false },
};

export default async function BillingPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/login?next=/account/billing");
  const { data: subscription } = await (await createSupabaseServerClient())
    .from("subscriptions")
    .select("plan, tier, status, period_end, cancel_at_period_end")
    .eq("user_id", auth.userId)
    .maybeSingle();
  return (
    <main className="narrow-page">
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </Link>
        <nav className="header-nav">
          <Link className="header-cta" href="/account">
            History
          </Link>
          <UserMenu email={auth.email} avatarUrl={auth.avatarUrl} />
        </nav>
      </header>
      <section className="account-heading">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Keep the good ideas moving.</h1>
        </div>
      </section>
      <section className="billing-card">
        {subscription && auth.isPro ? (
          <>
            <div className="billing-top">
              <div>
                <p className="eyebrow">
                  {subscription.tier === "studio" ? "Studio" : "Creator"} /{" "}
                  {subscription.plan === "yearly" ? "yearly" : "monthly"}
                </p>
                <h2>
                  {subscription.status === "canceling"
                    ? "Subscription canceled"
                    : "Active"}
                </h2>
              </div>
              <span className="billing-price">
                {subscription.tier === "studio" ? 300 : 100} credits / month
              </span>
            </div>
            <p>
              Your current period ends{" "}
              {new Date(subscription.period_end).toLocaleDateString("en-US", {
                dateStyle: "long",
              })}
              . Credits reset each period and never roll over.
            </p>
            {subscription.status === "canceling" ? (
              <p className="form-message">
                Your Pro access remains available until the period ends.
              </p>
            ) : (
              <CancelSubscriptionButton />
            )}
          </>
        ) : (
          <>
            <p className="eyebrow">Free studio</p>
            <h2>Try four directions every day.</h2>
            <p>
              Upgrade to Creator or Studio for more weighted credits, clean
              exports, and private history.
            </p>
            <Link className="solid-button" href="/pricing">
              See plans
            </Link>
          </>
        )}
      </section>
      <section className="policy-note">
        <h2>Refunds</h2>
        <p>
          Purchases may qualify for a refund within 7 days only when no credits
          have been settled. We review requests manually.
        </p>
        <a href="mailto:support@texttoposter.com">Contact support</a>
      </section>
    </main>
  );
}
