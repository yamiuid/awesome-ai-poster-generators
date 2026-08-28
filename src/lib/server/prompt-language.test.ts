import { describe, expect, it } from "vitest";
import { detectPosterLanguage } from "./prompt-language";

describe("poster language detection", () => {
  it("uses the script detector without calling the classifier", async () => {
    let calls = 0;
    const result = await detectPosterLanguage(
      "夏の音楽祭、海辺の夜",
      "en",
      async () => {
        calls += 1;
        return { language: "en", confidence: 1 };
      },
    );

    expect(result).toBe("ja");
    expect(calls).toBe(0);
  });

  it("uses the classifier for ambiguous Latin text", async () => {
    const result = await detectPosterLanguage(
      "A poster about a launch",
      "en",
      async () => ({ language: "es-419", confidence: 0.96 }),
    );

    expect(result).toBe("es-419");
  });

  it("falls back to the UI locale when classification is uncertain or fails", async () => {
    await expect(
      detectPosterLanguage("A short creative brief", "ja", async () => ({
        language: "en",
        confidence: 0.2,
      })),
    ).resolves.toBe("ja");
    await expect(
      detectPosterLanguage("A short creative brief", "ar", async () => {
        throw new Error("provider unavailable");
      }),
    ).resolves.toBe("ar");
  });
});
