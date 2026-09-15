import { describe, expect, it } from "vitest";
import {
  batchCreditCost,
  creditCost,
  isAspectRatio,
  isQuality,
  QUALITIES,
  type Quality,
  RESOLUTIONS,
  type Resolution,
} from "./credits";

/**
 * APIMart 最新价格表（积分/张）：只取决于分辨率 × 质量，与宽高比无关。
 * 低 / 中 / 高 / 超高 / 最高 对应 low / medium / high / xhigh / max。
 */
const PUBLISHED_PRICES: Readonly<
  Record<Resolution, Readonly<Record<Quality, number>>>
> = {
  "1k": { low: 2, medium: 4, high: 10, xhigh: 16, max: 34 },
  "2k": { low: 3, medium: 6, high: 18, xhigh: 32, max: 70 },
  "4k": { low: 4, medium: 8, high: 30, xhigh: 50, max: 115 },
};

describe("creditCost — GPT Image 2.5 Flare / Sunburst channel", () => {
  it("charges 1K tiers", () => {
    expect([
      creditCost("1k", "low"),
      creditCost("1k", "medium"),
      creditCost("1k", "high"),
      creditCost("1k", "xhigh"),
      creditCost("1k", "max"),
    ]).toEqual([2, 4, 10, 16, 34]);
  });

  it("charges 2K tiers", () => {
    expect([
      creditCost("2k", "low"),
      creditCost("2k", "medium"),
      creditCost("2k", "high"),
      creditCost("2k", "xhigh"),
      creditCost("2k", "max"),
    ]).toEqual([3, 6, 18, 32, 70]);
  });

  it("charges 4K tiers", () => {
    expect([
      creditCost("4k", "low"),
      creditCost("4k", "medium"),
      creditCost("4k", "high"),
      creditCost("4k", "xhigh"),
      creditCost("4k", "max"),
    ]).toEqual([4, 8, 30, 50, 115]);
  });

  it("matches the published table for every resolution and quality", () => {
    for (const resolution of RESOLUTIONS) {
      for (const quality of QUALITIES) {
        expect(creditCost(resolution, quality)).toBe(
          PUBLISHED_PRICES[resolution][quality],
        );
      }
    }
  });
});

describe("batchCreditCost", () => {
  it("charges batches atomically per image", () => {
    expect(batchCreditCost("1k", "low", 4)).toBe(8);
    expect(batchCreditCost("2k", "medium", 4)).toBe(24);
    expect(batchCreditCost("4k", "max", 4)).toBe(460);
  });

  it("defaults to four images per generation", () => {
    expect(batchCreditCost("1k", "medium")).toBe(16);
    expect(batchCreditCost("4k", "high")).toBe(120);
  });

  it("scales cost by the requested image count", () => {
    expect(batchCreditCost("1k", "medium", 1)).toBe(4);
    expect(batchCreditCost("1k", "medium", 2)).toBe(8);
    expect(batchCreditCost("2k", "high", 2)).toBe(36);
    expect(batchCreditCost("2k", "medium", 4)).toBe(24);
  });

  it("adds one credit per reference image on top of the base cost", () => {
    expect(batchCreditCost("1k", "low", 1, 0)).toBe(2);
    expect(batchCreditCost("1k", "low", 1, 1)).toBe(3);
    expect(batchCreditCost("1k", "low", 1, 5)).toBe(7);
    expect(batchCreditCost("4k", "max", 4, 5)).toBe(465);
  });
});

describe("quality tiers", () => {
  it("exposes the five GPT Image 2.5 tiers", () => {
    expect(QUALITIES).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it("recognises the added xhigh and max tiers", () => {
    expect(isQuality("low")).toBe(true);
    expect(isQuality("xhigh")).toBe(true);
    expect(isQuality("max")).toBe(true);
    expect(isQuality("ultra")).toBe(false);
  });
});

describe("common poster aspect ratios", () => {
  it("accepts editorial, story, slide, and landscape ratios", () => {
    expect(isAspectRatio("3:4")).toBe(true);
    expect(isAspectRatio("9:16")).toBe(true);
    expect(isAspectRatio("4:3")).toBe(true);
    expect(isAspectRatio("3:2")).toBe(true);
    expect(isAspectRatio("3:4x")).toBe(false);
  });
});
