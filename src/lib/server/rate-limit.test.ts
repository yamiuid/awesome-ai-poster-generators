import { describe, expect, it } from "vitest";
import { clientIpFromRequest, createRateLimiter } from "./rate-limit";

describe("clientIpFromRequest", () => {
  it("prefers Cloudflare's client address over forwarded values", () => {
    const request = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": "198.51.100.8",
        "x-forwarded-for": "203.0.113.2, 198.51.100.8",
      },
    });
    expect(clientIpFromRequest(request)).toBe("198.51.100.8");
  });

  it("uses the final forwarded address when Cloudflare is absent", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.2, 198.51.100.8" },
    });
    expect(clientIpFromRequest(request)).toBe("198.51.100.8");
  });
});

describe("createRateLimiter", () => {
  it("allows requests up to the limit and then blocks", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check("ip-1").ok).toBe(true);
    expect(limiter.check("ip-1").ok).toBe(true);
    expect(limiter.check("ip-1").ok).toBe(true);
    const blocked = limiter.check("ip-1");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("ip-a").ok).toBe(true);
    expect(limiter.check("ip-b").ok).toBe(true);
    expect(limiter.check("ip-a").ok).toBe(false);
  });

  it("resets after the window passes", async () => {
    const limiter = createRateLimiter({ windowMs: 10, max: 1 });
    expect(limiter.check("ip-1").ok).toBe(true);
    expect(limiter.check("ip-1").ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(limiter.check("ip-1").ok).toBe(true);
  });
});
