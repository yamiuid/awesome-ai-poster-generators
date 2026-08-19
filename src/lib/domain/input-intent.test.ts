import { describe, expect, it } from "vitest";
import { detectInputType, isUrlInput } from "./input-intent";

describe("detectInputType", () => {
  it("classifies a plain URL as url", () => {
    expect(detectInputType("https://example.com/my-ai-startup-launch")).toBe(
      "url",
    );
  });

  it("classifies a URL with trailing whitespace as url", () => {
    expect(detectInputType("  https://example.com/page  \n")).toBe("url");
  });

  it("classifies a protocol URL without a path as url", () => {
    expect(detectInputType("https://example.com")).toBe("url");
  });

  it("does not misclassify multi-line content that starts with a URL", () => {
    const value =
      "https://example.com/post\nThis is more content after the link.";
    expect(detectInputType(value)).toBe("idea");
    expect(isUrlInput(value)).toBe(false);
  });

  it("treats 299 characters as an idea", () => {
    expect(detectInputType("a".repeat(299))).toBe("idea");
  });

  it("treats exactly 300 characters as long text", () => {
    expect(detectInputType("a".repeat(300))).toBe("text");
  });

  it("treats long plain text as text", () => {
    expect(detectInputType("word ".repeat(100))).toBe("text");
  });
});
