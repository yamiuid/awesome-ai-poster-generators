import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCreditPackEvent,
  isCreditPackOrder,
  type WaffoEventPayload,
} from "./waffo-event-processing";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

const USER_ID = "3f1d8f2a-6c4b-4e2f-9c1d-7a5b8e0d4c33";

function packEvent(options?: {
  eventType?: string;
  checkoutPlan?: string;
  kind?: string;
}): WaffoEventPayload {
  return {
    eventType: options?.eventType ?? "order.completed",
    timestamp: "2026-09-14T00:00:00.000Z",
    data: {
      orderId: "ORD_PACK_1",
      merchantProvidedBuyerIdentity: USER_ID,
      orderMetadata: {
        userId: USER_ID,
        checkoutPlan: options?.checkoutPlan ?? "pack_standard",
        kind: options?.kind ?? "credit_pack",
        credits: "500",
      },
    },
  } as unknown as WaffoEventPayload;
}

describe("isCreditPackOrder", () => {
  it("detects pack orders by metadata kind", () => {
    expect(isCreditPackOrder({ orderMetadata: { kind: "credit_pack" } })).toBe(
      true,
    );
  });

  it("detects pack orders by checkoutPlan prefix", () => {
    expect(
      isCreditPackOrder({ orderMetadata: { checkoutPlan: "pack_starter" } }),
    ).toBe(true);
  });

  it("does not treat subscription orders as packs", () => {
    expect(
      isCreditPackOrder({
        orderMetadata: { checkoutPlan: "creator_monthly", plan: "monthly" },
      }),
    ).toBe(false);
    expect(isCreditPackOrder({ orderMetadata: {} })).toBe(false);
  });
});

describe("applyCreditPackEvent", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: 500, error: null });
  });

  it("grants pack credits from the server-side price table on order.completed", async () => {
    const outcome = await applyCreditPackEvent(
      { rpc: mocks.rpc } as never,
      packEvent(),
    );

    expect(outcome).toBe("applied");
    expect(mocks.rpc).toHaveBeenCalledWith("apply_credit_pack_grant", {
      p_user_id: USER_ID,
      p_order_id: "ORD_PACK_1",
      p_amount: 500,
    });
  });

  it("stays idempotent when the grant was already applied", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });

    const outcome = await applyCreditPackEvent(
      { rpc: mocks.rpc } as never,
      packEvent(),
    );

    expect(outcome).toBe("applied");
  });

  it("skips non-pack orders so they never activate a subscription", async () => {
    const outcome = await applyCreditPackEvent(
      { rpc: mocks.rpc } as never,
      packEvent({ checkoutPlan: "creator_monthly", kind: "subscription" }),
    );

    expect(outcome).toBe("skipped");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("skips pack refunds without touching credits (manual processing)", async () => {
    const outcome = await applyCreditPackEvent(
      { rpc: mocks.rpc } as never,
      packEvent({ eventType: "refund.succeeded" }),
    );

    expect(outcome).toBe("skipped");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("skips unmappable accounts instead of retrying forever", async () => {
    const event = packEvent();
    (event.data as unknown as Record<string, unknown>)["orderMetadata"] = {};

    const outcome = await applyCreditPackEvent(
      { rpc: mocks.rpc } as never,
      event,
    );

    expect(outcome).toBe("skipped");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
