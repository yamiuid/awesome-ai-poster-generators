import { describe, expect, it } from "vitest";
import { getVisiblePricingPlans } from "@/lib/domain/pricing";

const freePlan = {
  kind: "free",
  eyebrow: "Free / account",
  price: "$0",
  cadence: "/ forever",
  description: "Four poster images every UTC day.",
  features: ["4 poster images every UTC day"],
} as const;

const paidPlans = [
  {
    kind: "paid",
    billingPeriod: "monthly",
    eyebrow: "Creator / monthly",
    price: "$9.90",
    cadence: "/ month",
    description: "500 credits every month.",
    features: ["500 credits every month"],
    plan: "creator_monthly",
    featured: false,
    isConfigured: true,
    originalPrice: null,
    savings: null,
  },
  {
    kind: "paid",
    billingPeriod: "yearly",
    eyebrow: "Creator / yearly",
    price: "$79",
    cadence: "/ year",
    description: "500 credits in each monthly window.",
    features: ["500 credits in each monthly window"],
    plan: "creator_yearly",
    featured: false,
    isConfigured: true,
    originalPrice: "$118.80",
    savings: 39.8,
  },
] as const;

describe("getVisiblePricingPlans", () => {
  it.each(["monthly", "yearly"] as const)(
    "keeps the free plan when %s plans are selected",
    (billingPeriod) => {
      const visible = getVisiblePricingPlans(
        freePlan,
        paidPlans,
        billingPeriod,
      );

      expect(visible.map((plan) => plan.kind)).toEqual(["free", "paid"]);
      expect(visible[0]?.eyebrow).toBe("Free / account");
    },
  );
});
