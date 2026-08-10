"use client";

import { useState } from "react";
import {
  BILLING_PERIODS,
  type BillingPeriod,
  type CheckoutPlan,
} from "@/lib/domain/plans";
import type { SubscriptionLifecycleState } from "@/lib/server/waffo-subscription";
import { PricingAction } from "./pricing-actions";

type PricingPlan = Readonly<{
  billingPeriod: BillingPeriod;
  eyebrow: string;
  price: string;
  cadence: string;
  description: string;
  features: readonly string[];
  plan: CheckoutPlan;
  featured: boolean;
  isConfigured: boolean;
  originalPrice: string | null;
  savings: number | null;
}>;

type Props = Readonly<{
  plans: readonly PricingPlan[];
  subscriptionState: SubscriptionLifecycleState;
  isSignedIn: boolean;
}>;

const BILLING_LABELS: Readonly<Record<BillingPeriod, string>> = {
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatSavings(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function PricingPlans({ plans, subscriptionState, isSignedIn }: Props) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const visiblePlans = plans.filter(
    (plan) => plan.billingPeriod === billingPeriod,
  );
  const maxYearlySavings = plans.reduce(
    (maximum, plan) => Math.max(maximum, plan.savings ?? 0),
    0,
  );

  return (
    <section className="pricing-plans" aria-label="Subscription plans">
      <div className="billing-tabs" role="tablist" aria-label="Billing period">
        {BILLING_PERIODS.map((period) => {
          const selected = period === billingPeriod;
          const tabId = `billing-tab-${period}`;
          return (
            <button
              aria-controls="pricing-plan-panel"
              aria-selected={selected}
              className="billing-tab"
              id={tabId}
              key={period}
              onClick={() => setBillingPeriod(period)}
              role="tab"
              type="button"
            >
              <span>{BILLING_LABELS[period]}</span>
              {period === "yearly" ? (
                <span className="billing-tab-note">
                  Save up to {formatSavings(maxYearlySavings)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`billing-tab-${billingPeriod}`}
        className="plan-grid"
        id="pricing-plan-panel"
        role="tabpanel"
      >
        {visiblePlans.map((plan) => (
          <article
            className={`plan-card ${plan.featured ? "featured" : ""}`}
            key={plan.plan}
          >
            <p className="eyebrow">{plan.eyebrow}</p>
            <h2>
              {plan.price} <small>{plan.cadence}</small>
              {plan.originalPrice ? (
                <del className="plan-original-price">{plan.originalPrice}</del>
              ) : null}
            </h2>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <PricingAction
              plan={plan.plan}
              subscriptionState={subscriptionState}
              isSignedIn={isSignedIn}
              isConfigured={plan.isConfigured}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
