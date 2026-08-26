import {
  ScanAction,
  ScanPolicyCategory,
  ScanReasonCode,
  type ScanResult,
  ScanSemanticStatus,
} from "@waffo/pancake-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforcePromptSafety } from "./prompt-safety";

const mocks = vi.hoisted(() => ({ scanPrompt: vi.fn() }));

vi.mock("./waffo", () => ({
  getWaffoClient: () => ({
    contentSafety: { scanPrompt: mocks.scanPrompt },
  }),
}));

const verdict = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  action: ScanAction.Allow,
  reasonCode: ScanReasonCode.Allowed,
  matchedCategories: [],
  requestId: "REQ_test",
  semanticStatus: ScanSemanticStatus.Scored,
  ...overrides,
});

describe("prompt safety enforcement", () => {
  beforeEach(() => {
    mocks.scanPrompt.mockReset();
  });

  it("allows an English prompt and enforces semantic scanning", async () => {
    mocks.scanPrompt.mockResolvedValue(verdict());

    await expect(
      enforcePromptSafety("A red editorial poster"),
    ).resolves.toBeUndefined();

    expect(mocks.scanPrompt).toHaveBeenCalledWith({
      prompt: "A red editorial poster",
      locale: "en",
      semantic: "enforce",
    });
  });

  it.each([
    ["中文海报", "zh"],
    ["日本語のポスター", "ja"],
  ] as const)("passes the %s language hint", async (prompt, locale) => {
    mocks.scanPrompt.mockResolvedValue(verdict());

    await enforcePromptSafety(prompt);

    expect(mocks.scanPrompt).toHaveBeenCalledWith({
      prompt,
      locale,
      semantic: "enforce",
    });
  });

  it.each([
    [ScanPolicyCategory.CsamMinor, "sexual content involving minors"],
    [
      ScanPolicyCategory.SexualViolenceNonconsensual,
      "non-consensual sexual content",
    ],
    [
      ScanPolicyCategory.UndressTransform,
      "nudification or undressing transformations",
    ],
    [
      ScanPolicyCategory.FaceSwapIdentity,
      "identity or face-swap transformations",
    ],
    [
      ScanPolicyCategory.BestialityRestricted,
      "sexual content involving animals",
    ],
    [ScanPolicyCategory.AdultNsfw, "explicit adult sexual content"],
  ] as const)("explains a blocked %s prompt", async (category, reason) => {
    mocks.scanPrompt.mockResolvedValue(
      verdict({
        action: ScanAction.Block,
        reasonCode: ScanReasonCode.RestrictedContent,
        matchedCategories: [category],
      }),
    );

    await expect(enforcePromptSafety("blocked prompt")).rejects.toMatchObject({
      code: "PROMPT_SAFETY_BLOCKED",
      status: 422,
      message: expect.stringContaining(reason),
    });
  });

  it("returns a review-required error for a review verdict", async () => {
    mocks.scanPrompt.mockResolvedValue(
      verdict({
        action: ScanAction.Review,
        reasonCode: ScanReasonCode.ReviewRequired,
      }),
    );

    await expect(enforcePromptSafety("needs review")).rejects.toMatchObject({
      code: "PROMPT_SAFETY_REVIEW_REQUIRED",
      status: 422,
    });
  });

  it("fails closed when Waffo reports degraded service", async () => {
    mocks.scanPrompt.mockResolvedValue(
      verdict({
        action: ScanAction.Review,
        reasonCode: ScanReasonCode.ServiceDegraded,
      }),
    );

    await expect(enforcePromptSafety("temporary outage")).rejects.toMatchObject(
      {
        code: "PROMPT_SAFETY_UNAVAILABLE",
        status: 503,
      },
    );
  });

  it("fails closed when the scan request throws", async () => {
    mocks.scanPrompt.mockRejectedValue(new Error("network unavailable"));

    await expect(enforcePromptSafety("network failure")).rejects.toMatchObject({
      code: "PROMPT_SAFETY_UNAVAILABLE",
      status: 503,
    });
  });
});
