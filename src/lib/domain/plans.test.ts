import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKS,
  creditPackFor,
  creditsForTier,
  isCreditPackPlan,
  normalizeCheckoutPlan,
  yearlySavings,
} from "./plans";

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

describe("credit packs", () => {
  it("exposes four one-time packs with prices above the subscription rate", () => {
    expect(Object.keys(CREDIT_PACKS)).toEqual([
      "pack_starter",
      "pack_standard",
      "pack_pro",
      "pack_max",
    ]);
    expect(CREDIT_PACKS.pack_starter).toMatchObject({
      credits: 200,
      price: 4.9,
    });
    expect(CREDIT_PACKS.pack_standard).toMatchObject({
      credits: 500,
      price: 10.9,
    });
    expect(CREDIT_PACKS.pack_pro).toMatchObject({
      credits: 2000,
      price: 36.9,
    });
    expect(CREDIT_PACKS.pack_max).toMatchObject({
      credits: 5000,
      price: 84.9,
    });

    // 积分包单价必须高于对应量级的订阅单价：
    // 小包（≤500 点）对比 Creator 月付 $9.90/500 = $0.0198/积分，
    // 大包（≥2000 点）对比 Scale 月付 $49.90/3000 = $0.0166/积分，
    // 保证"买更多订阅点数"始终比同量级一次性包更划算。
    expect(
      CREDIT_PACKS.pack_starter.price / CREDIT_PACKS.pack_starter.credits,
    ).toBeGreaterThan(9.9 / 500);
    expect(
      CREDIT_PACKS.pack_standard.price / CREDIT_PACKS.pack_standard.credits,
    ).toBeGreaterThan(9.9 / 500);
    expect(
      CREDIT_PACKS.pack_pro.price / CREDIT_PACKS.pack_pro.credits,
    ).toBeGreaterThan(49.9 / 3000);
    expect(
      CREDIT_PACKS.pack_max.price / CREDIT_PACKS.pack_max.credits,
    ).toBeGreaterThan(49.9 / 3000);
    // 量大价优：单点价随档位递减
    const packs = Object.values(CREDIT_PACKS);
    for (let i = 1; i < packs.length; i += 1) {
      const current = packs[i];
      const previous = packs[i - 1];
      if (!current || !previous) {
        throw new Error("Unexpected missing credit pack");
      }
      expect(current.price / current.credits).toBeLessThan(
        previous.price / previous.credits,
      );
    }
  });

  it("resolves pack plans and rejects unknown ones", () => {
    expect(creditPackFor("pack_standard")?.credits).toBe(500);
    expect(creditPackFor("creator_monthly")).toBeNull();
    expect(isCreditPackPlan("pack_max")).toBe(true);
    expect(isCreditPackPlan("studio_monthly")).toBe(false);
  });

  it("never treats a pack plan as a subscription checkout plan", () => {
    for (const plan of Object.keys(CREDIT_PACKS)) {
      expect(normalizeCheckoutPlan(plan)).toBeNull();
    }
  });
});
