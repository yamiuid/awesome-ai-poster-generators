import { describe, expect, it } from "vitest";
import { batchCreditCost, creditCost, isAspectRatio } from "./credits";

describe("creditCost — GPT Image 2 official channel", () => {
  it("charges 1K tiers by aspect ratio group", () => {
    // 1K low: 全部比例同价
    expect(creditCost("1k", "low", "1:1")).toBe(2);
    expect(creditCost("1k", "low", "4:5")).toBe(2);
    expect(creditCost("1k", "low", "2:3")).toBe(2);
    expect(creditCost("1k", "low", "16:9")).toBe(2);
    // 1K medium: 2:3/3:2 组更高
    expect(creditCost("1k", "medium", "1:1")).toBe(10);
    expect(creditCost("1k", "medium", "4:5")).toBe(10);
    expect(creditCost("1k", "medium", "16:9")).toBe(10);
    expect(creditCost("1k", "medium", "2:3")).toBe(16);
    // 1K high: 1:1 组低，其余同价
    expect(creditCost("1k", "high", "1:1")).toBe(38);
    expect(creditCost("1k", "high", "4:5")).toBe(56);
    expect(creditCost("1k", "high", "2:3")).toBe(56);
    expect(creditCost("1k", "high", "16:9")).toBe(56);
  });

  it("charges 2K tiers by aspect ratio group", () => {
    expect(creditCost("2k", "low", "1:1")).toBe(4);
    expect(creditCost("2k", "low", "4:5")).toBe(6);
    expect(creditCost("2k", "low", "2:3")).toBe(4);
    expect(creditCost("2k", "low", "16:9")).toBe(4);
    expect(creditCost("2k", "medium", "1:1")).toBe(38);
    expect(creditCost("2k", "medium", "4:5")).toBe(47);
    expect(creditCost("2k", "medium", "2:3")).toBe(28);
    expect(creditCost("2k", "medium", "16:9")).toBe(28);
    expect(creditCost("2k", "high", "1:1")).toBe(149);
    expect(creditCost("2k", "high", "4:5")).toBe(186);
    expect(creditCost("2k", "high", "2:3")).toBe(112);
    expect(creditCost("2k", "high", "16:9")).toBe(112);
  });

  it("charges 4K tiers uniformly across ratios", () => {
    expect(creditCost("4k", "low", "1:1")).toBe(8);
    expect(creditCost("4k", "low", "4:5")).toBe(8);
    expect(creditCost("4k", "medium", "2:3")).toBe(66);
    expect(creditCost("4k", "medium", "16:9")).toBe(66);
    expect(creditCost("4k", "high", "1:1")).toBe(261);
    expect(creditCost("4k", "high", "4:5")).toBe(261);
  });
});

describe("batchCreditCost", () => {
  it("charges batches atomically per image", () => {
    expect(batchCreditCost("1k", "low", "4:5")).toBe(8);
    expect(batchCreditCost("2k", "medium", "4:5")).toBe(188);
    expect(batchCreditCost("4k", "high", "1:1")).toBe(1044);
  });

  it("scales cost by the requested image count", () => {
    expect(batchCreditCost("1k", "medium", "2:3", 1)).toBe(16);
    expect(batchCreditCost("1k", "medium", "1:1", 2)).toBe(20);
    expect(batchCreditCost("2k", "high", "4:5", 2)).toBe(372);
    expect(batchCreditCost("2k", "medium", "16:9", 4)).toBe(112);
  });
});

describe("common poster aspect ratios", () => {
  it("accepts editorial, story, slide, and landscape ratios", () => {
    expect(isAspectRatio("3:4")).toBe(true);
    expect(isAspectRatio("9:16")).toBe(true);
    expect(isAspectRatio("4:3")).toBe(true);
    expect(isAspectRatio("3:2")).toBe(true);
    expect(creditCost("2k", "medium", "3:4")).toBe(47);
    expect(creditCost("2k", "medium", "9:16")).toBe(28);
  });
});
