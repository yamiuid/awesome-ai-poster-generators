import { describe, expect, it } from "vitest";
import {
  periodEnd,
  planFor,
  statusFor,
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

  it("maps Waffo lifecycle and order statuses to access states", () => {
    expect(statusFor("subscription.updated", "canceling")).toBe("canceling");
    expect(statusFor("subscription.payment_succeeded")).toBe("active");
    expect(statusFor("refund.succeeded")).toBe("refunded");
  });
});
