import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button";
import { SiteHeader } from "@/components/site-header";
import { creditsForTier } from "@/lib/domain/plans";
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
      <SiteHeader initialAuth={auth} />
      <section className="account-heading">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Keep the good ideas moving.</h1>
        </div>
      </section>
      <section className="billing-card">
        {subscription &&
        (auth.subscriptionState === "active" ||
          auth.subscriptionState === "canceling") ? (
          <>
            <div className="billing-top">
              <div>
                <p className="eyebrow">
                  {subscription.tier === "studio" ? "Studio" : "Creator"} /{" "}
                  {subscription.plan === "yearly" ? "yearly" : "monthly"}
                </p>
                <h2>
                  {auth.subscriptionState === "canceling"
                    ? "Cancellation scheduled"
                    : "Active"}
                </h2>
              </div>
              <span className="billing-price">
                {creditsForTier(subscription.tier).toLocaleString("en-US")}{" "}
                credits / month
              </span>
            </div>
            <p>
              Your current period ends{" "}
              {new Date(subscription.period_end).toLocaleDateString("en-US", {
                dateStyle: "long",
              })}
              . Credits reset each period and never roll over.
            </p>
            {auth.subscriptionState === "canceling" ? (
              <p className="form-message">
                Your Pro access remains available until the period ends. You can
                choose any new plan after that date.
              </p>
            ) : (
              <CancelSubscriptionButton />
            )}
          </>
        ) : auth.subscriptionState === "ended" ? (
          <>
            <p className="eyebrow">Subscription ended</p>
            <h2>Choose your next plan.</h2>
            <p>
              Your previous subscription has ended. Choose Creator or Studio to
              start a new billing period.
            </p>
            <Link className="solid-button" href="/pricing">
              Choose a plan
            </Link>
          </>
        ) : auth.subscriptionState === "past_due" ||
          auth.subscriptionState === "stale" ? (
          <>
            <p className="eyebrow">Billing needs attention</p>
            <h2>We need to check your subscription.</h2>
            <p>
              We could not confirm the latest billing state. New purchases are
              paused so you are not charged twice.
            </p>
            <a className="solid-button" href="mailto:support@texttoposter.com">
              Contact support
            </a>
          </>
        ) : (
          <>
            <p className="eyebrow">Free studio</p>
            <h2>Start with two directions at a time.</h2>
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
