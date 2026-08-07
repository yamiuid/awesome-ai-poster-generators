import { describe, expect, it } from "vitest";
import { computeAvailable, sumAmounts } from "./credit-ledger";

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
