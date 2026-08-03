import { describe, expect, it } from "vitest";
import { batchCreditCost, creditCost } from "./credits";

describe("creditCost", () => {
  it("returns the weighted cost for every supported resolution and quality", () => {
    expect(creditCost("1k", "medium")).toBe(1);
    expect(creditCost("2k", "medium")).toBe(2);
    expect(creditCost("4k", "medium")).toBe(4);
    expect(creditCost("1k", "high")).toBe(4);
    expect(creditCost("2k", "high")).toBe(8);
    expect(creditCost("4k", "high")).toBe(16);
  });

  it("charges four-image batches atomically", () => {
    expect(batchCreditCost("1k", "medium")).toBe(4);
    expect(batchCreditCost("2k", "medium")).toBe(8);
    expect(batchCreditCost("4k", "medium")).toBe(16);
    expect(batchCreditCost("1k", "high")).toBe(16);
    expect(batchCreditCost("2k", "high")).toBe(32);
    expect(batchCreditCost("4k", "high")).toBe(64);
  });
});
