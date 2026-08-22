import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getGuestIdentity } from "./guest";

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
});
