"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  type FreePricingPlan,
  getVisiblePricingPlans,
  type PackPricingPlan,
  type PaidPricingPlan,
  type VisiblePricingPlan,
} from "@/lib/domain/pricing";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import type { SubscriptionLifecycleState } from "@/lib/server/waffo-subscription";
import { PricingAction } from "./pricing-actions";
import { useAccountStatus } from "./use-account-status";

type Props = Readonly<{
  freePlan: FreePricingPlan;
  plans: readonly PaidPricingPlan[];
  packs?: readonly PackPricingPlan[];
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
          <h2 className="plan-name">{plan.name}</h2>
          <p className="plan-audience">{plan.audience}</p>
          <p className="plan-price-line">
            <span className="plan-price">{plan.price}</span>
            <small> {plan.cadence}</small>
          </p>
          <p className="plan-credits-line">{plan.creditsLabel}</p>
          <p className="plan-credits-note">{plan.creditsNote}</p>
          <div className="pricing-action">
            {isSignedIn && subscriptionState === "none" ? (
              <button
                aria-disabled="true"
                className="solid-button is-current"
                type="button"
              >
                {t("currentPlan")}
              </button>
            ) : isSignedIn ? (
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
          </div>
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      );
    case "paid":
      return (
        <article
          className={`plan-card ${plan.featured ? "featured" : ""}`}
          key={plan.plan}
        >
          {plan.discountPercent ? (
            <span className="plan-discount-badge" aria-hidden="true">
              -{plan.discountPercent}%
            </span>
          ) : null}
          {plan.featured ? (
            <span className="plan-popular-badge" aria-hidden="true">
              {t("popularBadge")}
            </span>
          ) : null}
          <h2 className="plan-name">{plan.name}</h2>
          <p className="plan-audience">{plan.audience}</p>
          <p className="plan-price-line">
            <span className="plan-price">{plan.price}</span>
            <small> {plan.cadence}</small>
            {plan.originalPrice ? (
              <del className="plan-original-price">{plan.originalPrice}</del>
            ) : null}
          </p>
          {plan.yearlyNote ? (
            <p className="plan-yearly-note">{plan.yearlyNote}</p>
          ) : null}
          <p className="plan-credits-line">{plan.creditsLabel}</p>
          <p className="plan-credits-note">{plan.creditsNote}</p>
          <PricingAction
            plan={plan.plan}
            subscriptionState={subscriptionState}
            isSignedIn={isSignedIn}
            isConfigured={plan.isConfigured}
          />
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      );
    case "pack":
      return (
        <article className="plan-card" key={plan.plan}>
          <h2 className="plan-name">{plan.name}</h2>
          <p className="plan-audience">{plan.audience}</p>
          <p className="plan-price-line">
            <span className="plan-price">{plan.price}</span>
            <small> {plan.cadence}</small>
          </p>
          <p className="plan-credits-line">{plan.creditsLabel}</p>
          <p className="plan-credits-note">{plan.creditsNote}</p>
          <PricingAction
            plan={plan.plan}
            subscriptionState={subscriptionState}
            isSignedIn={isSignedIn}
            isConfigured={plan.isConfigured}
          />
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      );
    default:
      return assertNever(plan);
  }
}

export function PricingPlans({ freePlan, plans, packs = [] }: Props) {
  const t = useTranslations("pricing");
  // 定价页现在是静态预渲染，登录态与订阅状态在挂载后校准（默认按未登录渲染）；
  // "当前方案"这类标记只影响展示，结算与否仍由服务端接口按 cookie 裁决。
  const status = useAccountStatus();
  const isSignedIn = status?.signedIn ?? false;
  const subscriptionState: SubscriptionLifecycleState =
    status?.subscriptionState ?? "none";
  const [tab, setTab] = useState<"monthly" | "yearly" | "packs">("monthly");
  const visiblePlans = getVisiblePricingPlans(
    freePlan,
    plans,
    tab === "packs" ? "monthly" : tab,
  );
  const maxDiscountPercent = plans.reduce(
    (maximum, plan) => Math.max(maximum, plan.discountPercent ?? 0),
    0,
  );

  // 兼容 /pricing#credit-packs 锚点：挂载后自动切到积分包 tab
  useEffect(() => {
    if (window.location.hash === "#credit-packs") {
      setTab("packs");
    }
  }, []);

  const tabs: ReadonlyArray<{
    id: "monthly" | "yearly" | "packs";
    label: string;
    note?: string | undefined;
  }> = [
    { id: "monthly", label: t("monthly") },
    {
      id: "yearly",
      label: t("yearly"),
      note: maxDiscountPercent > 0 ? `-${maxDiscountPercent}%` : undefined,
    },
    { id: "packs", label: t("packTab") },
  ];

  return (
    <section className="pricing-plans" aria-label={t("subscriptionPlans")}>
      <div
        className="billing-tabs"
        role="tablist"
        aria-label={t("billingPeriod")}
      >
        {tabs.map((entry) => {
          const selected = entry.id === tab;
          return (
            <button
              aria-controls="pricing-plan-panel"
              aria-selected={selected}
              className="billing-tab"
              id={`billing-tab-${entry.id}`}
              key={entry.id}
              onClick={() => setTab(entry.id)}
              role="tab"
              type="button"
            >
              <span>{entry.label}</span>
              {entry.note ? (
                <span className="billing-tab-badge">{entry.note}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tab === "packs" && <p className="packs-tab-intro">{t("packsIntro")}</p>}
      <div
        aria-labelledby={`billing-tab-${tab}`}
        className="plan-grid"
        id="pricing-plan-panel"
        role="tabpanel"
      >
        {tab === "packs"
          ? packs.map((pack) => (
              <PricingPlanCard
                key={pack.plan}
                plan={pack}
                subscriptionState={subscriptionState}
                isSignedIn={isSignedIn}
              />
            ))
          : visiblePlans.map((plan) => (
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
