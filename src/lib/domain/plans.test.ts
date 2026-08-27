import { describe, expect, it } from "vitest";
import { creditsForTier, normalizeCheckoutPlan, yearlySavings } from "./plans";

describe("subscription plans", () => {
  it("normalizes every supported checkout selection", () => {
    expect(normalizeCheckoutPlan("creator_monthly")).toEqual({
      checkoutPlan: "creator_monthly",
      tier: "creator",
      billingPeriod: "monthly",
    });
    expect(normalizeCheckoutPlan("creator_yearly")).toEqual({
      checkoutPlan: "creator_yearly",
      tier: "creator",
      billingPeriod: "yearly",
    });
    expect(normalizeCheckoutPlan("studio_monthly")).toEqual({
      checkoutPlan: "studio_monthly",
      tier: "studio",
      billingPeriod: "monthly",
    });
    expect(normalizeCheckoutPlan("studio_yearly")).toEqual({
      checkoutPlan: "studio_yearly",
      tier: "studio",
      billingPeriod: "yearly",
    });
  });

  it("keeps legacy checkout values on the Creator tier", () => {
    expect(normalizeCheckoutPlan("monthly")?.checkoutPlan).toBe(
      "creator_monthly",
    );
    expect(normalizeCheckoutPlan("yearly")?.checkoutPlan).toBe(
      "creator_yearly",
    );
    expect(normalizeCheckoutPlan("enterprise")).toBeNull();
  });

  it.each([
    ["creator", 500],
    ["studio", 1_000],
  ] as const)("grants %s credits per monthly window", (tier, credits) => {
    expect(creditsForTier(tier)).toBe(credits);
  });

  it.each([
    [9.9, 79, 39.8],
    [19.9, 169, 69.8],
  ] as const)(
    "calculates yearly savings for %s monthly and %s yearly",
    (monthly, yearly, savings) => {
      expect(yearlySavings(monthly, yearly)).toBe(savings);
    },
  );
});
