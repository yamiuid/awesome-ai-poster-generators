import { describe, expect, it } from "vitest";
import {
  FREE_REFERENCE_IMAGES,
  GUEST_REFERENCE_IMAGES,
  MAX_REFERENCE_IMAGES,
  normalizeReferenceImages,
  referenceImageLimit,
} from "./poster";

describe("reference image limits", () => {
  it("gives each tier its own allowance", () => {
    expect(referenceImageLimit("guest")).toBe(1);
    expect(referenceImageLimit("free")).toBe(2);
    expect(referenceImageLimit("pro")).toBe(5);
  });

  it("keeps the tier allowances aligned with the hard cap", () => {
    expect(GUEST_REFERENCE_IMAGES).toBe(1);
    expect(FREE_REFERENCE_IMAGES).toBe(2);
    expect(MAX_REFERENCE_IMAGES).toBe(5);
  });

  it("never normalizes beyond the hard cap", () => {
    const urls = Array.from(
      { length: 8 },
      (_, index) => `https://example.com/${index}.png`,
    );
    expect(normalizeReferenceImages({ referenceImageUrls: urls })).toHaveLength(
      MAX_REFERENCE_IMAGES,
    );
  });
});
