export const SUBSCRIPTION_TIERS = ["creator", "studio"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const BILLING_PERIODS = ["monthly", "yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const CHECKOUT_PLANS = [
  "creator_monthly",
  "creator_yearly",
  "studio_monthly",
  "studio_yearly",
] as const;
export type CheckoutPlan = (typeof CHECKOUT_PLANS)[number];

export type PlanSelection = Readonly<{
  checkoutPlan: CheckoutPlan;
  tier: SubscriptionTier;
  billingPeriod: BillingPeriod;
}>;

const PLAN_SELECTIONS: Readonly<Record<CheckoutPlan, PlanSelection>> = {
  creator_monthly: {
    checkoutPlan: "creator_monthly",
    tier: "creator",
    billingPeriod: "monthly",
  },
  creator_yearly: {
    checkoutPlan: "creator_yearly",
    tier: "creator",
    billingPeriod: "yearly",
  },
  studio_monthly: {
    checkoutPlan: "studio_monthly",
    tier: "studio",
    billingPeriod: "monthly",
  },
  studio_yearly: {
    checkoutPlan: "studio_yearly",
    tier: "studio",
    billingPeriod: "yearly",
  },
};

export function normalizeCheckoutPlan(value: string): PlanSelection | null {
  switch (value) {
    case "monthly":
      return PLAN_SELECTIONS.creator_monthly;
    case "yearly":
      return PLAN_SELECTIONS.creator_yearly;
    case "creator_monthly":
    case "creator_yearly":
    case "studio_monthly":
    case "studio_yearly":
      return PLAN_SELECTIONS[value];
    default:
      return null;
  }
}

export function creditsForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case "creator":
      return 100;
    case "studio":
      return 300;
  }
}

export function tierForMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
  fallback: SubscriptionTier = "creator",
): SubscriptionTier {
  if (metadata?.["tier"] === "studio") {
    return "studio";
  }
  if (metadata?.["tier"] === "creator") {
    return "creator";
  }
  const selection = metadata?.["checkoutPlan"];
  return selection
    ? (normalizeCheckoutPlan(selection)?.tier ?? fallback)
    : fallback;
}
