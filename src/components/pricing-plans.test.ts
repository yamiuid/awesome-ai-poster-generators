import { describe, expect, it } from "vitest";
import { getVisiblePricingPlans } from "@/lib/domain/pricing";

const freePlan = {
  kind: "free",
  name: "Free",
  audience: "Try the studio — free credits on signup.",
  price: "$0",
  cadence: "/ month",
  creditsLabel: "30 credits · one-time welcome",
  creditsNote: "About 15 1K images in total.",
  features: ["30 welcome credits (one-time)"],
} as const;

const paidPlans = [
  {
    kind: "paid",
    billingPeriod: "monthly",
    name: "Creator",
    audience: "A light monthly allowance for solo creators.",
    price: "$9.90",
    cadence: "/ month",
    yearlyNote: "Billed $79.00 yearly — save $39.80",
    creditsLabel: "500 credits / month",
    creditsNote: "Up to about 250 1K images each month.",
    features: ["1K / 2K / 4K output"],
    plan: "creator_monthly",
    featured: false,
    isConfigured: true,
    originalPrice: null,
    savings: null,
    discountPercent: null,
  },
  {
    kind: "paid",
    billingPeriod: "yearly",
    name: "Creator",
    audience: "A light monthly allowance for solo creators.",
    price: "$6.58",
    cadence: "/ month",
    yearlyNote: "Billed $94.80 yearly — save $24.00",
    creditsLabel: "500 credits / month",
    creditsNote: "Up to about 250 1K images each month.",
    features: ["Same full Creator studio access"],
    plan: "creator_yearly",
    featured: false,
    isConfigured: true,
    originalPrice: null,
    savings: 24,
    discountPercent: 20,
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
      const first = visible[0];
      expect(first?.kind === "free" && first.name).toBe("Free");
    },
  );
});
