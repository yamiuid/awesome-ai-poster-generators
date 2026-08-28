"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { BILLING_PERIODS, type BillingPeriod } from "@/lib/domain/plans";
import {
  type FreePricingPlan,
  getVisiblePricingPlans,
  type PaidPricingPlan,
  type VisiblePricingPlan,
} from "@/lib/domain/pricing";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import type { SubscriptionLifecycleState } from "@/lib/server/waffo-subscription";
import { PricingAction } from "./pricing-actions";

type Props = Readonly<{
  freePlan: FreePricingPlan;
  plans: readonly PaidPricingPlan[];
  subscriptionState: SubscriptionLifecycleState;
  isSignedIn: boolean;
}>;

function assertNever(value: never): never {
  throw new Error(`Unknown pricing plan kind: ${String(value)}`);
}

function PricingPlanCard({
  plan,
  subscriptionState,
  isSignedIn,
}: Readonly<{
  plan: VisiblePricingPlan;
  subscriptionState: SubscriptionLifecycleState;
  isSignedIn: boolean;
}>) {
  const t = useTranslations("pricing");
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  switch (plan.kind) {
    case "free":
      return (
        <article className="plan-card" key="free">
          <p className="eyebrow">{plan.eyebrow}</p>
          <h2>
            {plan.price} <small>{plan.cadence}</small>
          </h2>
          <p>{plan.description}</p>
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {isSignedIn ? (
            <Link className="solid-button" href="/#studio">
              {t("openFreeStudio")}
            </Link>
          ) : (
            <Link
              className="solid-button"
              href={`/login?next=${encodeURIComponent(localizedPath("/#studio", locale))}`}
            >
              {t("createFreeAccount")}
            </Link>
          )}
        </article>
      );
    case "paid":
      return (
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
      );
    default:
      return assertNever(plan);
  }
}

export function PricingPlans({
  freePlan,
  plans,
  subscriptionState,
  isSignedIn,
}: Props) {
  const t = useTranslations("pricing");
  const format = useFormatter();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const visiblePlans = getVisiblePricingPlans(freePlan, plans, billingPeriod);
  const maxYearlySavings = plans.reduce(
    (maximum, plan) => Math.max(maximum, plan.savings ?? 0),
    0,
  );

  return (
    <section className="pricing-plans" aria-label={t("subscriptionPlans")}>
      <div
        className="billing-tabs"
        role="tablist"
        aria-label={t("billingPeriod")}
      >
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
              <span>{period === "monthly" ? t("monthly") : t("yearly")}</span>
              {period === "yearly" ? (
                <span className="billing-tab-note">
                  {t("saveUpTo", {
                    amount: format.number(maxYearlySavings, {
                      style: "currency",
                      currency: "USD",
                    }),
                  })}
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
          <PricingPlanCard
            key={plan.kind === "free" ? "free" : plan.plan}
            plan={plan}
            subscriptionState={subscriptionState}
            isSignedIn={isSignedIn}
          />
        ))}
      </div>
    </section>
  );
}
