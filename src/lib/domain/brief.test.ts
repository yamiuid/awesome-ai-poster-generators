import { describe, expect, it } from "vitest";
import {
  buildBriefPrompt,
  buildFallbackPrompt,
  normalizeBriefFields,
  parseLooseJson,
} from "./brief";

describe("parseLooseJson", () => {
  it("parses a clean JSON object", () => {
    expect(parseLooseJson('{"headline":"Hi"}')).toEqual({
      headline: "Hi",
    });
  });

  it("extracts a JSON object from surrounding text", () => {
    expect(
      parseLooseJson('Sure! Here it is:\n{"headline":"Hi"}\nDone.'),
    ).toEqual({ headline: "Hi" });
  });

  it("throws when no JSON object exists", () => {
    expect(() => parseLooseJson("no json here")).toThrow();
  });
});

describe("normalizeBriefFields", () => {
  it("pads points to exactly three entries", () => {
    expect(
      normalizeBriefFields({
        headline: "Headline",
        subtitle: "",
        points: ["One"],
        cta: "",
      }),
    ).toEqual({
      headline: "Headline",
      subtitle: "",
      points: ["One", "", ""],
      cta: "",
    });
  });

  it("rejects missing headline", () => {
    expect(normalizeBriefFields({ points: [] })).toBeNull();
  });
});

describe("buildBriefPrompt", () => {
  it("joins non-empty brief parts in order", () => {
    expect(
      buildBriefPrompt({
        headline: "H",
        subtitle: "S",
        points: ["P1", "", "P3"],
        cta: "CTA",
      }),
    ).toBe("H\nS\nP1\nP3\nCTA");
  });

  it("returns an empty string when every field is empty", () => {
    expect(
      buildBriefPrompt({
        headline: "",
        subtitle: "",
        points: ["", "", ""],
        cta: "",
      }),
    ).toBe("");
  });
});

describe("buildFallbackPrompt", () => {
  it("uses title and description for a URL", () => {
    expect(
      buildFallbackPrompt({
        inputType: "url",
        prompt: "https://example.com/post",
        preview: {
          domain: "example.com",
          title: "Launch Day",
          description: "We shipped.",
        },
      }),
    ).toBe("Launch Day — We shipped.");
  });

  it("falls back to the domain when a URL has no metadata", () => {
    expect(
      buildFallbackPrompt({
        inputType: "url",
        prompt: "https://example.com/post",
        preview: null,
      }),
    ).toBe("A poster about example.com");
  });

  it("truncates long pasted text to 600 characters", () => {
    expect(
      buildFallbackPrompt({
        inputType: "text",
        prompt: "x".repeat(900),
        preview: null,
      }).length,
    ).toBe(600);
  });
});
