import type { BillingPeriod, CheckoutPlan } from "./plans";

export type PaidPricingPlan = Readonly<{
  kind: "paid";
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

export type FreePricingPlan = Readonly<{
  kind: "free";
  eyebrow: string;
  price: string;
  cadence: string;
  description: string;
  features: readonly string[];
}>;

export type VisiblePricingPlan = FreePricingPlan | PaidPricingPlan;

export function getVisiblePricingPlans(
  freePlan: FreePricingPlan,
  plans: readonly PaidPricingPlan[],
  billingPeriod: BillingPeriod,
): readonly VisiblePricingPlan[] {
  return [
    freePlan,
    ...plans.filter((plan) => plan.billingPeriod === billingPeriod),
  ];
}
