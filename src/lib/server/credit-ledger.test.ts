import { describe, expect, it } from "vitest";
import {
  computeAvailable,
  selectBalancePeriod,
  sumAmounts,
} from "./credit-ledger";

const subscriptionPeriod = {
  id: "period-sub",
  period_start: "2026-08-06",
  period_end: "2026-09-06",
  credits_granted: 500,
  bucket: "subscription",
};
const permanentPeriod = {
  id: "period-perm",
  period_start: "1970-01-01",
  period_end: "9999-12-31",
  credits_granted: 30,
  bucket: "permanent",
};
const now = new Date("2026-09-17T00:00:00.000Z");

describe("sumAmounts", () => {
  it("returns zero for an empty list", () => {
    expect(sumAmounts([])).toBe(0);
  });

  it("sums row amounts", () => {
    expect(sumAmounts([{ amount: 4 }, { amount: 10 }, { amount: 2 }])).toBe(16);
  });
});

describe("computeAvailable", () => {
  it("subtracts reserved and consumed from granted", () => {
    expect(computeAvailable(300, 40, 120)).toBe(140);
  });

  it("can go negative when reserved exceeds granted", () => {
    expect(computeAvailable(100, 120, 10)).toBe(-30);
  });
});

describe("selectBalancePeriod", () => {
  it("uses the subscription bucket while the plan is still running", () => {
    const selection = selectBalancePeriod(
      [permanentPeriod, subscriptionPeriod],
      {
        status: "canceling",
        period_end: "2026-10-06T00:00:00.000Z",
        tier: "creator",
      },
      now,
    );

    expect(selection.primary?.id).toBe("period-sub");
    expect(selection.expired).toBeNull();
  });

  it("falls back to the permanent bucket once the period is over", () => {
    const selection = selectBalancePeriod(
      [permanentPeriod, subscriptionPeriod],
      {
        status: "canceling",
        period_end: "2026-09-06T00:00:00.000Z",
        tier: "creator",
      },
      now,
    );

    expect(selection.primary?.id).toBe("period-perm");
    expect(selection.expired).toMatchObject({
      tier: "creator",
      periodId: "period-sub",
      creditsGranted: 500,
    });
  });

  it("reports the expired period even without a permanent bucket", () => {
    const selection = selectBalancePeriod(
      [subscriptionPeriod],
      {
        status: "canceled",
        period_end: "2026-09-06T00:00:00.000Z",
        tier: "studio",
      },
      now,
    );

    expect(selection.primary).toBeNull();
    expect(selection.expired?.tier).toBe("studio");
  });

  it("has nothing to report for a user that never subscribed", () => {
    const selection = selectBalancePeriod([permanentPeriod], null, now);

    expect(selection.primary?.id).toBe("period-perm");
    expect(selection.expired).toBeNull();
  });

  it("keeps the permanent bucket when an active plan has no period row yet", () => {
    const selection = selectBalancePeriod(
      [permanentPeriod],
      {
        status: "active",
        period_end: "2026-10-06T00:00:00.000Z",
        tier: "creator",
      },
      now,
    );

    expect(selection.primary?.id).toBe("period-perm");
    expect(selection.expired).toBeNull();
  });
});
