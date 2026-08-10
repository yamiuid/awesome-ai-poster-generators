import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAdmin: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/server/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createAdmin,
}));
vi.mock("@/lib/server/waffo", () => ({
  getWaffoClient: () => ({
    orders: { cancelSubscription: mocks.cancelSubscription },
  }),
}));

import { POST } from "./route";

const FUTURE = "2026-09-10T00:00:00.000Z";

function configureSubscription(status: "active" | "canceling"): void {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        waffo_order_id: "ORD_1",
        status,
        period_end: FUTURE,
      },
      error: null,
    }),
    update: vi.fn().mockReturnThis(),
  };
  query.eq.mockImplementation((column: string) => {
    if (column === "user_id") return query;
    return Promise.resolve({ error: null });
  });
  mocks.createAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
}

describe("POST /api/subscription/cancel", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.createAdmin.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.cancelSubscription.mockResolvedValue({
      orderId: "ORD_1",
      status: "canceling",
    });
    mocks.requireUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      isPro: true,
      subscriptionState: "active",
    });
  });

  it("does not call Waffo again for an already canceling subscription", async () => {
    configureSubscription("canceling");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "canceling" });
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it("cancels an active subscription and persists the pending state", async () => {
    configureSubscription("active");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "canceling" });
    expect(mocks.cancelSubscription).toHaveBeenCalledWith({ orderId: "ORD_1" });
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mocks.requireUser.mockRejectedValue(
      new AppError("AUTH_REQUIRED", "Please sign in to continue.", 401),
    );

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });
});
