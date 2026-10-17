import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isGuestGenerationRateLimited,
  isGuestUploadRateLimited,
} from "./guest-throttle";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./env", () => ({
  getServerEnv: () => ({ RATE_LIMIT_PEPPER: "p".repeat(32) }),
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

function request(ip: string, spoofedIp = "203.0.113.99"): Request {
  return new Request("https://example.com/api/generations", {
    headers: {
      "cf-connecting-ip": ip,
      "x-forwarded-for": `${spoofedIp}, ${ip}`,
    },
  });
}

describe("guest ip throttle", () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });

  it("checks a peppered network address without trusting the forwarded prefix", async () => {
    expect(await isGuestGenerationRateLimited(request("198.51.100.1"))).toBe(
      false,
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "consume_guest_ip_rate_limit",
      expect.objectContaining({ p_action: "generation" }),
    );
    const args = mocks.rpc.mock.calls[0]?.[1];
    expect(args.p_ip_hash).not.toContain("198.51.100.1");
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a block when the database reports an exhausted window", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await isGuestGenerationRateLimited(request("198.51.100.2"))).toBe(
      true,
    );
  });

  it("uses a separate counter for uploads", async () => {
    await isGuestUploadRateLimited(request("198.51.100.3"));
    expect(mocks.rpc).toHaveBeenCalledWith(
      "consume_guest_ip_rate_limit",
      expect.objectContaining({ p_action: "upload" }),
    );
  });

  it("fails closed when the database cannot check the limit", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      isGuestGenerationRateLimited(request("198.51.100.4")),
    ).rejects.toMatchObject({
      code: "GUEST_RATE_LIMIT_UNAVAILABLE",
      status: 503,
    });
  });
});
