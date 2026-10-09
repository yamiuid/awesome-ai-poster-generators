import { describe, expect, it } from "vitest";
import {
  activePrimaryNav,
  loginRedirectPath,
  PRIMARY_NAV_ITEMS,
} from "./navigation";

describe("primary navigation", () => {
  it("opens poster inspiration when the examples navigation is selected", () => {
    expect(
      PRIMARY_NAV_ITEMS.find((item) => item.key === "examples")?.href,
    ).toBe("/poster-design-ideas");
  });
  it("links Generators directly to the homepage studio", () => {
    expect(PRIMARY_NAV_ITEMS[0]).toMatchObject({
      key: "generators",
      href: "/#studio",
    });
  });
});

describe("loginRedirectPath", () => {
  it.each([
    [undefined, "/"],
    [null, "/"],
    ["/pricing", "/pricing"],
    ["/#studio", "/#studio"],
    ["/account/billing", "/account/billing"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/auth/callback", "/"],
  ] as const)("maps %s to %s", (next, expected) => {
    expect(loginRedirectPath(next)).toBe(expected);
  });
});

describe("activePrimaryNav", () => {
  it.each([
    ["/pricing", "pricing"],
    ["/about", "about"],
    ["/poster-design-ideas", "examples"],
    ["/es/poster-design-ideas", "examples"],
    ["/movie-poster-maker", "generators"],
    ["/business-poster-generator", "generators"],
    ["/anime-poster-maker", "generators"],
    ["/vintage-poster-maker", "generators"],
    ["/neon-poster-generator", "generators"],
    ["/minimal-poster-generator", "generators"],
    ["/", null],
    ["/privacy", null],
    ["/account", null],
  ] as const)("marks %s as %s", (pathname, expected) => {
    expect(activePrimaryNav(pathname)).toBe(expected);
  });
});
