export const SUBSCRIPTION_TIERS = ["creator", "studio", "scale"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const BILLING_PERIODS = ["monthly", "yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const CHECKOUT_PLANS = [
  "creator_monthly",
  "creator_yearly",
  "studio_monthly",
  "studio_yearly",
  "scale_monthly",
  "scale_yearly",
] as const;
export type CheckoutPlan = (typeof CHECKOUT_PLANS)[number];

export const CREDIT_PACK_PLANS = [
  "pack_starter",
  "pack_standard",
  "pack_pro",
  "pack_max",
] as const;
export type CreditPackPlan = (typeof CREDIT_PACK_PLANS)[number];

export type CreditPack = Readonly<{
  plan: CreditPackPlan;
  credits: number;
  price: number;
}>;

/**
 * 一次性积分包。单价略高于订阅（Creator 月付 $9.90/500 积分 = $0.0198/积分，
 * Scale 月付 $49.90/3000 = $0.0166/积分），量大递减但始终略高于订阅单点，
 * 保证订阅仍是重度用户的更划算选项。
 * credits 数以本表为唯一事实来源：webhook 按事件 metadata 中的 checkoutPlan
 * 查表入账，前端定价页也查表展示。
 */
export const CREDIT_PACKS: Readonly<Record<CreditPackPlan, CreditPack>> = {
  pack_starter: { plan: "pack_starter", credits: 200, price: 4.9 },
  pack_standard: { plan: "pack_standard", credits: 500, price: 10.9 },
  pack_pro: { plan: "pack_pro", credits: 2000, price: 36.9 },
  pack_max: { plan: "pack_max", credits: 5000, price: 84.9 },
};

export function creditPackFor(plan: string): CreditPack | null {
  return (CREDIT_PACKS as Record<string, CreditPack | undefined>)[plan] ?? null;
}

export function isCreditPackPlan(plan: string): plan is CreditPackPlan {
  return (CREDIT_PACK_PLANS as readonly string[]).includes(plan);
}

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
  scale_monthly: {
    checkoutPlan: "scale_monthly",
    tier: "scale",
    billingPeriod: "monthly",
  },
  scale_yearly: {
    checkoutPlan: "scale_yearly",
    tier: "scale",
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
    case "scale_monthly":
    case "scale_yearly":
      return PLAN_SELECTIONS[value];
    default:
      return null;
  }
}

export function creditsForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case "creator":
      return 500;
    case "studio":
      return 1_000;
    case "scale":
      return 3_000;
  }
}

export function yearlySavings(
  monthlyPrice: number,
  yearlyPrice: number,
): number {
  return Math.max(0, Math.round((monthlyPrice * 12 - yearlyPrice) * 100) / 100);
}

/** 相对原价的折扣百分比（如 17 表示 -17%）；无折扣时返回 0。 */
export function discountPercent(originalPrice: number, price: number): number {
  if (originalPrice <= 0 || price <= 0 || price >= originalPrice) {
    return 0;
  }
  return Math.max(0, Math.round((1 - price / originalPrice) * 100));
}

/** 年付相对月付×12 的折扣百分比（如 33 表示 -33%）。 */
export function yearlyDiscountPercent(
  monthlyPrice: number,
  yearlyPrice: number,
): number {
  return discountPercent(monthlyPrice * 12, yearlyPrice);
}

export function tierForMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
  fallback: SubscriptionTier = "creator",
): SubscriptionTier {
  if (metadata?.["tier"] === "studio") {
    return "studio";
  }
  if (metadata?.["tier"] === "scale") {
    return "scale";
  }
  if (metadata?.["tier"] === "creator") {
    return "creator";
  }
  const selection = metadata?.["checkoutPlan"];
  return selection
    ? (normalizeCheckoutPlan(selection)?.tier ?? fallback)
    : fallback;
}
