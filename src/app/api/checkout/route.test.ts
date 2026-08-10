import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/server/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    WAFFO_MONTHLY_PRODUCT_ID: "PROD_creator_monthly",
    WAFFO_YEARLY_PRODUCT_ID: "PROD_creator_yearly",
    WAFFO_STUDIO_MONTHLY_PRODUCT_ID: "PROD_studio_monthly",
    WAFFO_STUDIO_YEARLY_PRODUCT_ID: "PROD_studio_yearly",
  }),
}));
vi.mock("@/lib/server/waffo", () => ({
  getWaffoClient: () => ({
    checkout: { authenticated: { create: mocks.create } },
  }),
}));

import { POST } from "./route";

describe("POST /api/checkout", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({
      checkoutUrl: "https://pay.example/checkout",
    });
  });

  it.each([
    ["active", "SUBSCRIPTION_ACTIVE"],
    ["canceling", "SUBSCRIPTION_CANCELING"],
    ["past_due", "SUBSCRIPTION_PAST_DUE"],
    ["stale", "SUBSCRIPTION_STALE"],
  ] as const)(
    "blocks a %s subscription before creating checkout",
    async (state, code) => {
      mocks.requireUser.mockResolvedValue({
        userId: "user-1",
        email: "user@example.com",
        isPro: state === "active" || state === "canceling",
        subscriptionState: state,
      });

      const response = await POST(
        new Request("http://localhost/api/checkout", {
          method: "POST",
          body: JSON.stringify({ plan: "creator_monthly" }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code });
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("creates checkout after a subscription has ended", async () => {
    mocks.requireUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      isPro: false,
      subscriptionState: "ended",
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "studio_yearly" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkoutUrl: "https://pay.example/checkout",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "PROD_studio_yearly",
        buyerIdentity: "user-1",
      }),
    );
  });
});
