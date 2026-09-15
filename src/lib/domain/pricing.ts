import type { BillingPeriod, CheckoutPlan, CreditPackPlan } from "./plans";

export type PaidPricingPlan = Readonly<{
  kind: "paid";
  billingPeriod: BillingPeriod;
  /** 档位名（Creator / Studio / Scale），品牌名不做本地化 */
  name: string;
  /** 适合人群的一句话描述 */
  audience: string;
  /** 主价格：月付卡为月价；年付卡为年费折算的月价 */
  price: string;
  cadence: string;
  /** 年付提示行（如"年付 $79 · 一年省 $39.80"），翻译层已组装 */
  yearlyNote: string | null;
  /** 每月赠送积分（已本地化格式的字符串） */
  creditsLabel: string;
  /** 预计可生成图片数的小字说明（翻译层已组装） */
  creditsNote: string;
  features: readonly string[];
  plan: CheckoutPlan;
  featured: boolean;
  isConfigured: boolean;
  originalPrice: string | null;
  savings: number | null;
  /** 年付折扣百分比（如 33 表示 -33%），月付为 null */
  discountPercent: number | null;
}>;

export type PackPricingPlan = Readonly<{
  kind: "pack";
  /** 包名（Starter / Standard / Value），品牌名不做本地化 */
  name: string;
  audience: string;
  price: string;
  cadence: string;
  creditsLabel: string;
  creditsNote: string;
  features: readonly string[];
  plan: CreditPackPlan;
  isConfigured: boolean;
}>;

export type FreePricingPlan = Readonly<{
  kind: "free";
  name: string;
  audience: string;
  price: string;
  cadence: string;
  creditsLabel: string;
  creditsNote: string;
  features: readonly string[];
}>;

export type VisiblePricingPlan =
  | FreePricingPlan
  | PaidPricingPlan
  | PackPricingPlan;

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
