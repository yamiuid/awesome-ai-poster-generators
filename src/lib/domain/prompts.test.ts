import { describe, expect, it } from "vitest";
import { generationRequestSchema } from "./poster";
import { buildPosterPrompt, detectTextLanguage } from "./prompts";

describe("buildPosterPrompt", () => {
  it("keeps the user idea and selected art direction in the provider prompt", () => {
    const prompt = buildPosterPrompt({
      prompt: "A summer music festival by the sea",
      style: "neon",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "medium",
      imageCount: 4,
    });

    expect(prompt).toContain("A summer music festival by the sea");
    expect(prompt).toContain("electric neon nightlife");
    expect(prompt).toContain("portrait social poster composition");
  });

  it("infers an art direction when Auto is selected", () => {
    const prompt = buildPosterPrompt({
      prompt: "A night market food festival",
      style: "auto",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
    });

    expect(prompt).toContain("infer the single most suitable art direction");
  });

  it("accepts a style selected from More styles", () => {
    const request = generationRequestSchema.safeParse({
      prompt: "A symposium on modern architecture",
      style: "art_deco",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
    });

    expect(request.success).toBe(true);
  });

  it("describes the Story ratio as a full-height mobile composition", () => {
    const prompt = buildPosterPrompt({
      prompt: "A launch announcement for a new creative app",
      style: "business",
      aspectRatio: "9:16",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
    });

    expect(prompt).toContain("full-height vertical mobile poster composition");
  });

  it("instructs the model to use a reference image when provided", () => {
    const prompt = buildPosterPrompt(
      {
        prompt: "A launch announcement for a new creative app",
        style: "business",
        aspectRatio: "4:5",
        resolution: "1k",
        quality: "low",
        imageCount: 1,
      },
      { hasReferenceImage: true },
    );

    expect(prompt).toContain(
      "Use the provided reference image as the primary visual material",
    );
  });

  it("forces English poster text for English core ideas", () => {
    const prompt = buildPosterPrompt({
      prompt: "A summer music festival by the sea",
      style: "neon",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
    });
    expect(prompt).toContain("All poster text must be written in English.");
    expect(prompt).toContain("Do not use Chinese characters");
  });

  it("forces Simplified Chinese poster text for Simplified Chinese core ideas", () => {
    const prompt = buildPosterPrompt({
      prompt: "海边夏日音乐节，一晚三组舞台",
      style: "neon",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
    });
    expect(prompt).toContain(
      "All poster text must be written in Simplified Chinese.",
    );
    expect(prompt).toContain("Do not use English");
  });

  it("detects the dominant language from CJK ratio", () => {
    expect(detectTextLanguage("A summer music festival by the sea")).toBe("en");
    expect(detectTextLanguage("海边夏日音乐节，一晚三组舞台")).toBe("zh-Hans");
    expect(detectTextLanguage("AI 人工智能海报设计")).toBe("zh-Hans");
    expect(detectTextLanguage("海邊夏日音樂節，一晚三組舞台")).toBe("zh-TW");
    expect(detectTextLanguage("夏の音楽祭、海辺の夜")).toBe("ja");
    expect(detectTextLanguage("ليلة موسيقية في المدينة")).toBe("ar");
    expect(detectTextLanguage("Festival de música de verano")).toBe("es-419");
  });

  it("accepts a UI locale for language detection fallback", () => {
    expect(detectTextLanguage("A new poster direction", "es")).toBe("es-419");
    expect(detectTextLanguage("A new poster direction", "zh-TW")).toBe("zh-TW");
  });

  it("accepts the site locale in a generation request", () => {
    const request = generationRequestSchema.safeParse({
      prompt: "A poster brief",
      style: "auto",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "low",
      imageCount: 1,
      siteLocale: "ja",
    });
    expect(request.success).toBe(true);
  });
});
