import { describe, expect, it } from "vitest";
import {
  isGuestGenerationRateLimited,
  isGuestUploadRateLimited,
} from "./guest-throttle";

function request(ip: string): Request {
  return new Request("https://example.com/api/generations", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("guest ip throttle", () => {
  it("leaves normal guest usage alone", () => {
    expect(isGuestGenerationRateLimited(request("198.51.100.1"))).toBe(false);
  });

  it("stops a scripted flood from one address", () => {
    const ip = "198.51.100.2";
    for (let index = 0; index < 30; index += 1) {
      expect(isGuestGenerationRateLimited(request(ip))).toBe(false);
    }

    expect(isGuestGenerationRateLimited(request(ip))).toBe(true);
  });

  it("counts generations and uploads separately", () => {
    const ip = "198.51.100.3";
    for (let index = 0; index < 30; index += 1) {
      isGuestGenerationRateLimited(request(ip));
    }

    expect(isGuestGenerationRateLimited(request(ip))).toBe(true);
    expect(isGuestUploadRateLimited(request(ip))).toBe(false);
  });
});
