import { describe, expect, it } from "vitest";
import { generationRequestSchema } from "./poster";
import { buildPosterPrompt } from "./prompts";

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
});
