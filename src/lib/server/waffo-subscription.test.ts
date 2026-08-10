import { describe, expect, it } from "vitest";
import {
  canStartCheckout,
  lifecycleState,
  periodEnd,
  planFor,
  shouldApplySubscriptionEvent,
  shouldProcessPaymentEvent,
  statusFor,
  tierFor,
} from "./waffo-subscription";

const NOW = "2026-08-10T00:00:00.000Z";

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

describe("subscription lifecycle", () => {
  it("classifies an account without a subscription as none", () => {
    expect(lifecycleState(null)).toBe("none");
    expect(canStartCheckout("none")).toBe(true);
  });

  it("keeps an active subscription active before its period end", () => {
    expect(
      lifecycleState(
        { status: "active", periodEnd: "2026-08-11T00:00:00.000Z" },
        new Date(NOW),
      ),
    ).toBe("active");
    expect(canStartCheckout("active")).toBe(false);
  });

  it("treats an active subscription at its exact period end as stale", () => {
    expect(
      lifecycleState({ status: "active", periodEnd: NOW }, new Date(NOW)),
    ).toBe("stale");
  });

  it("allows checkout after a canceling subscription reaches its period end", () => {
    const state = lifecycleState(
      { status: "canceling", periodEnd: NOW },
      new Date(NOW),
    );
    expect(state).toBe("ended");
    expect(canStartCheckout(state)).toBe(true);
  });

  it("blocks checkout while a subscription is past due", () => {
    expect(canStartCheckout("past_due")).toBe(false);
  });

  it("classifies canceled and refunded subscriptions as ended", () => {
    expect(
      lifecycleState({ status: "canceled", periodEnd: "2026-01-01T00:00:00Z" }),
    ).toBe("ended");
    expect(
      lifecycleState({ status: "refunded", periodEnd: "2026-01-01T00:00:00Z" }),
    ).toBe("ended");
    expect(canStartCheckout("ended")).toBe(true);
  });
});

describe("shouldApplySubscriptionEvent", () => {
  it("ignores an old order cancellation after a new order is active", () => {
    expect(
      shouldApplySubscriptionEvent(
        {
          orderId: "ORD_new",
          status: "active",
          periodEnd: "2026-09-10T00:00:00.000Z",
          lastEventAt: "2026-08-10T00:00:00.000Z",
        },
        {
          orderId: "ORD_old",
          status: "canceled",
          timestamp: "2026-08-11T00:00:00.000Z",
        },
        new Date("2026-08-11T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("accepts a new active order after the previous one ended", () => {
    expect(
      shouldApplySubscriptionEvent(
        {
          orderId: "ORD_old",
          status: "canceled",
          periodEnd: "2026-08-01T00:00:00.000Z",
          lastEventAt: "2026-08-01T00:00:00.000Z",
        },
        {
          orderId: "ORD_new",
          status: "active",
          timestamp: "2026-08-10T00:00:00.000Z",
        },
        new Date("2026-08-10T00:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
