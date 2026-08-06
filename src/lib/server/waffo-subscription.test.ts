import { describe, expect, it } from "vitest";
import {
  periodEnd,
  planFor,
  shouldProcessPaymentEvent,
  statusFor,
  tierFor,
} from "./waffo-subscription";

describe("shouldProcessPaymentEvent", () => {
  it("processes a fresh non-duplicate event", () => {
    expect(shouldProcessPaymentEvent(false, null)).toBe(true);
  });

  it("skips a duplicate that was already processed", () => {
    expect(shouldProcessPaymentEvent(true, "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("reprocesses a duplicate that was never marked processed", () => {
    expect(shouldProcessPaymentEvent(true, null)).toBe(true);
  });
});

describe("periodEnd", () => {
  it("rolls a monthly plan forward one month", () => {
    expect(periodEnd("2026-01-15T00:00:00Z", "monthly")).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });

  it("rolls a yearly plan forward twelve months", () => {
    expect(periodEnd("2026-01-15T00:00:00Z", "yearly")).toBe(
      "2027-01-15T00:00:00.000Z",
    );
  });

  it("clamps the day to the last valid day of the target month", () => {
    // 1月31日 → 2月没有31日，应为2月28日
    expect(periodEnd("2026-01-31T00:00:00Z", "monthly")).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });
});

describe("planFor", () => {
  it("prefers the metadata plan", () => {
    expect(
      planFor({ orderMetadata: { plan: "yearly" }, billingPeriod: "monthly" }),
    ).toBe("yearly");
  });

  it("falls back to billingPeriod when metadata is absent", () => {
    expect(planFor({ billingPeriod: "monthly" })).toBe("monthly");
  });

  it("falls back to the provided default when neither matches", () => {
    expect(planFor({}, "monthly")).toBe("monthly");
  });

  it("returns null when nothing matches and no default given", () => {
    expect(planFor({})).toBeNull();
  });

  it("ignores invalid metadata plan values", () => {
    expect(planFor({ orderMetadata: { plan: "bogus" } })).toBeNull();
  });
});

describe("tierFor", () => {
  it("reads the studio tier from metadata", () => {
    expect(tierFor({ orderMetadata: { tier: "studio" } })).toBe("studio");
  });

  it("reads the creator tier from metadata", () => {
    expect(tierFor({ orderMetadata: { tier: "creator" } })).toBe("creator");
  });

  it("derives the tier from a checkoutPlan when tier is missing", () => {
    expect(tierFor({ orderMetadata: { checkoutPlan: "studio_yearly" } })).toBe(
      "studio",
    );
  });

  it("falls back to creator when metadata is empty", () => {
    expect(tierFor({})).toBe("creator");
  });
});

describe("statusFor", () => {
  it("maps refund.succeeded to refunded", () => {
    expect(statusFor("refund.succeeded")).toBe("refunded");
  });

  it("maps subscription.canceling to canceling", () => {
    expect(statusFor("subscription.canceling")).toBe("canceling");
  });

  it("maps subscription.canceled to canceled", () => {
    expect(statusFor("subscription.canceled")).toBe("canceled");
  });

  it("maps subscription.past_due to past_due", () => {
    expect(statusFor("subscription.past_due")).toBe("past_due");
  });

  it("treats order.completed as active", () => {
    expect(statusFor("order.completed")).toBe("active");
  });

  it("treats subscription.activated as active", () => {
    expect(statusFor("subscription.activated")).toBe("active");
  });

  it("treats subscription.payment_succeeded as active", () => {
    expect(statusFor("subscription.payment_succeeded")).toBe("active");
  });

  it("treats subscription.uncanceled as active", () => {
    expect(statusFor("subscription.uncanceled")).toBe("active");
  });

  it("prefers the order status when it is a terminal state", () => {
    expect(statusFor("order.completed", "canceled")).toBe("canceled");
    expect(statusFor("order.completed", "expired")).toBe("canceled");
    expect(statusFor("order.completed", "past_due")).toBe("past_due");
    expect(statusFor("order.completed", "canceling")).toBe("canceling");
  });

  it("returns null for unknown events without a terminal order status", () => {
    expect(statusFor("unknown.event")).toBeNull();
  });
});
