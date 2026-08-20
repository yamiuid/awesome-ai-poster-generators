import { describe, expect, it } from "vitest";
import { normalizePageUnderstanding } from "./url-analyze";

describe("normalizePageUnderstanding", () => {
  it("normalizes a valid understanding", () => {
    expect(
      normalizePageUnderstanding({
        pageType: "article",
        topic: "AI",
        audience: "Readers",
        primaryMessage: "AI is big.",
        keyPoints: ["One", "Two"],
      }),
    ).toEqual({
      pageType: "article",
      topic: "AI",
      audience: "Readers",
      primaryMessage: "AI is big.",
      keyPoints: ["One", "Two"],
    });
  });

  it("truncates overlong fields instead of rejecting", () => {
    const result = normalizePageUnderstanding({
      pageType: "a".repeat(50),
      topic: "t".repeat(200),
      audience: "u".repeat(200),
      primaryMessage: "m".repeat(600),
      keyPoints: Array.from(
        { length: 8 },
        (_, index) => "k".repeat(300) + index,
      ),
    });
    expect(result).not.toBeNull();
    expect(result?.pageType).toBe("a".repeat(40));
    expect(result?.topic).toBe("t".repeat(120));
    expect(result?.audience).toBe("u".repeat(120));
    expect(result?.primaryMessage).toBe("m".repeat(500));
    expect(result?.keyPoints).toHaveLength(5);
  });

  it("rejects a payload missing pageType or topic", () => {
    expect(normalizePageUnderstanding({})).toBeNull();
  });
});
