import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "./prompts";

describe("buildPosterPrompt", () => {
  it("keeps the user idea and selected art direction in the provider prompt", () => {
    const prompt = buildPosterPrompt({
      prompt: "A summer music festival by the sea",
      style: "neon",
      aspectRatio: "4:5",
      resolution: "1k",
      quality: "medium",
    });

    expect(prompt).toContain("A summer music festival by the sea");
    expect(prompt).toContain("electric neon nightlife");
    expect(prompt).toContain("portrait social poster composition");
  });
});
