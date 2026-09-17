import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getGuestIdentity, withGuestCookie } from "./guest";

vi.mock("./env", () => ({
  getServerEnv: vi.fn(() => ({ RATE_LIMIT_PEPPER: "p".repeat(32) })),
}));

describe("guest identity", () => {
  it("keeps the quota key stable when proxy headers change", () => {
    const first = getGuestIdentity(
      new NextRequest("https://example.com", {
        headers: {
          cookie: "tp_guest=guest-cookie",
          "user-agent": "browser-a",
          "x-forwarded-for": "203.0.113.10",
        },
      }),
    );
    const second = getGuestIdentity(
      new NextRequest("https://example.com", {
        headers: {
          cookie: "tp_guest=guest-cookie",
          "user-agent": "browser-b",
          "x-forwarded-for": "203.0.113.11",
        },
      }),
    );

    expect(first.key).toBe(second.key);
    expect(first.limitKey).toBe(second.limitKey);
  });

  it("hands the identity to a visitor that has no cookie yet", () => {
    const request = new NextRequest("https://example.com/api/generations");
    const identity = getGuestIdentity(request);

    const response = withGuestCookie(
      NextResponse.json({ ok: true }),
      request,
      identity,
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`tp_guest=${identity.cookieValue}`);
    expect(cookie).toContain("HttpOnly");
  });

  it("leaves an existing identity untouched", () => {
    const request = new NextRequest("https://example.com/api/generations", {
      headers: { cookie: "tp_guest=guest-cookie" },
    });
    const identity = getGuestIdentity(request);

    const response = withGuestCookie(
      NextResponse.json({ ok: true }),
      request,
      identity,
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
