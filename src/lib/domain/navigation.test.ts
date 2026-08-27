import { describe, expect, it } from "vitest";
import { loginRedirectPath } from "./navigation";

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
