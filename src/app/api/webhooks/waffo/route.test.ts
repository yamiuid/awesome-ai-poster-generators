import { describe, expect, it } from "vitest";
import {
  periodEnd,
  planFor,
  shouldProcessPaymentEvent,
  statusFor,
  tierFor,
} from "../../../../lib/server/waffo-subscription";

describe("Waffo subscription event helpers", () => {
  it("clamps month-end billing periods instead of overflowing into the next month", () => {
    expect(periodEnd("2026-01-31T00:00:00.000Z", "monthly")).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("keeps the known plan when an event omits billing metadata", () => {
    expect(planFor({}, "yearly")).toBe("yearly");
  });

  it("maps Studio metadata to the higher credit tier", () => {
    expect(tierFor({ orderMetadata: { tier: "studio" } })).toBe("studio");
    expect(tierFor({ orderMetadata: { checkoutPlan: "studio_yearly" } })).toBe(
      "studio",
    );
    expect(tierFor({})).toBe("creator");
  });

  it("maps Waffo lifecycle and order statuses to access states", () => {
    expect(statusFor("subscription.updated", "canceling")).toBe("canceling");
    expect(statusFor("subscription.payment_succeeded")).toBe("active");
    expect(statusFor("refund.succeeded")).toBe("refunded");
  });

  it("reprocesses duplicate events until processing is recorded", () => {
    expect(shouldProcessPaymentEvent(true, null)).toBe(true);
    expect(shouldProcessPaymentEvent(true, "2026-08-04T00:00:00.000Z")).toBe(
      false,
    );
    expect(shouldProcessPaymentEvent(false, null)).toBe(true);
  });
});
