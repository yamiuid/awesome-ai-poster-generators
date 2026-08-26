import {
  ScanAction,
  ScanPolicyCategory,
  ScanReasonCode,
  ScanSemanticMode,
} from "@waffo/pancake-ts";
import { AppError } from "./errors";
import { getWaffoClient } from "./waffo";

const CATEGORY_REASONS: Readonly<Record<ScanPolicyCategory, string>> = {
  [ScanPolicyCategory.CsamMinor]: "sexual content involving minors",
  [ScanPolicyCategory.SexualViolenceNonconsensual]:
    "non-consensual sexual content",
  [ScanPolicyCategory.UndressTransform]:
    "nudification or undressing transformations",
  [ScanPolicyCategory.FaceSwapIdentity]:
    "identity or face-swap transformations",
  [ScanPolicyCategory.BestialityRestricted]: "sexual content involving animals",
  [ScanPolicyCategory.AdultNsfw]: "explicit adult sexual content",
};

type PromptLocale = "ja" | "zh" | "en";

function localeForPrompt(prompt: string): PromptLocale {
  if (/[\u3040-\u30ff]/u.test(prompt)) {
    return "ja";
  }
  if (/[\u3400-\u9fff]/u.test(prompt)) {
    return "zh";
  }
  return "en";
}

function blockedPromptMessage(
  categories: readonly ScanPolicyCategory[],
): string {
  const reasons = [
    ...new Set(
      categories.map((category) => CATEGORY_REASONS[category]).filter(Boolean),
    ),
  ];
  const detail = reasons.length > 0 ? reasons.join(", ") : "restricted content";
  return `This prompt was blocked because it includes ${detail}. Revise the prompt and try again.`;
}

function reviewError(reasonCode: ScanReasonCode): AppError {
  switch (reasonCode) {
    case ScanReasonCode.ServiceDegraded:
      return new AppError(
        "PROMPT_SAFETY_UNAVAILABLE",
        "The safety review service could not complete the check. Please try again shortly.",
        503,
      );
    case ScanReasonCode.ReviewRequired:
    case ScanReasonCode.Allowed:
    case ScanReasonCode.RestrictedContent:
      return new AppError(
        "PROMPT_SAFETY_REVIEW_REQUIRED",
        "This prompt needs additional safety review and cannot be generated right now. Revise it or try again later.",
        422,
      );
    default:
      return assertNever(reasonCode);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected prompt safety value: ${String(value)}`);
}

export async function enforcePromptSafety(prompt: string): Promise<void> {
  let verdict: Awaited<
    ReturnType<ReturnType<typeof getWaffoClient>["contentSafety"]["scanPrompt"]>
  >;
  try {
    verdict = await getWaffoClient().contentSafety.scanPrompt({
      prompt,
      locale: localeForPrompt(prompt),
      semantic: ScanSemanticMode.Enforce,
    });
  } catch (error) {
    console.error("Prompt safety scan failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    throw new AppError(
      "PROMPT_SAFETY_UNAVAILABLE",
      "The safety review service could not complete the check. Please try again shortly.",
      503,
    );
  }

  switch (verdict.action) {
    case ScanAction.Allow:
      return;
    case ScanAction.Block:
      throw new AppError(
        "PROMPT_SAFETY_BLOCKED",
        blockedPromptMessage(verdict.matchedCategories),
        422,
      );
    case ScanAction.Review:
      throw reviewError(verdict.reasonCode);
    default:
      return assertNever(verdict.action);
  }
}
