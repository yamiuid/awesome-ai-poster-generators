import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  periodEnd,
  planFor,
  shouldProcessPaymentEvent,
  statusFor,
  tierFor,
} from "../../../../lib/server/waffo-subscription";

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  insertError: null as { code?: string } | null,
  existing: null as Record<string, unknown> | null,
  upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/waffo", () => ({
  verifyWaffoWebhook: mocks.verifyWebhook,
}));

vi.mock("@/lib/server/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) =>
      table === "payment_events"
        ? {
            insert: () => Promise.resolve({ error: mocks.insertError }),
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { processed_at: null },
                    error: null,
                  }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        : {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: mocks.existing, error: null }),
              }),
            }),
            upsert: (row: Record<string, unknown>) => {
              mocks.upserts.push(row);
              return Promise.resolve({ error: null });
            },
          },
  }),
}));

import { POST } from "./route";

describe("Waffo subscription event helpers", () => {
  it("clamps month-end billing periods instead of overflowing into the next month", () => {
    expect(periodEnd("2026-01-31T00:00:00.000Z", "monthly")).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("keeps the known plan when an event omits billing metadata", () => {
    expect(planFor({}, "yearly")).toBe("yearly");
  });

  it("maps Studio metadata to the higher credit tier", () => {
    expect(tierFor({ orderMetadata: { tier: "studio" } })).toBe("studio");
    expect(tierFor({ orderMetadata: { checkoutPlan: "studio_yearly" } })).toBe(
      "studio",
    );
    expect(tierFor({})).toBe("creator");
  });

  it("maps Waffo lifecycle and order statuses to access states", () => {
    expect(statusFor("subscription.updated", "canceling")).toBe("canceling");
    expect(statusFor("subscription.payment_succeeded")).toBe("active");
    expect(statusFor("refund.succeeded")).toBe("refunded");
  });

  it("reprocesses duplicate events until processing is recorded", () => {
    expect(shouldProcessPaymentEvent(true, null)).toBe(true);
    expect(shouldProcessPaymentEvent(true, "2026-08-04T00:00:00.000Z")).toBe(
      false,
    );
    expect(shouldProcessPaymentEvent(false, null)).toBe(true);
  });
});

const RENEWAL_AT = "2026-09-08T04:20:43.300Z";
const STORED_SUBSCRIPTION = {
  waffo_order_id: "ORD_1",
  last_event_at: "2026-08-08T00:00:00.000Z",
  period_start: "2026-08-08T00:00:00.000Z",
  period_end: "2026-09-08T00:00:00.000Z",
  plan: "monthly",
  tier: "creator",
  status: "active",
};

function waffoEvent(options: {
  id: string;
  eventType: string;
  timestamp: string;
  data?: Record<string, string>;
}) {
  return {
    id: options.id,
    timestamp: options.timestamp,
    eventType: options.eventType,
    eventId: `${options.id}-business`,
    storeId: "STO_1",
    storeName: "Store",
    mode: "prod",
    data: {
      orderId: "ORD_1",
      buyerEmail: "buyer@example.com",
      currency: "USD",
      amount: "3.99",
      taxAmount: "0.00",
      productName: "Monthly-VIP",
      orderMetadata: { userId: "user-1", plan: "monthly", tier: "creator" },
      ...options.data,
    },
  };
}

function webhookRequest(): Request {
  return new Request("http://localhost/api/webhooks/waffo", {
    method: "POST",
    body: JSON.stringify({ id: "evt_1" }),
    headers: { "x-waffo-signature": "t=1,v1=signature" },
  });
}

describe("POST /api/webhooks/waffo", () => {
  beforeEach(() => {
    mocks.verifyWebhook.mockReset();
    mocks.insertError = null;
    mocks.existing = null;
    mocks.upserts.length = 0;
  });

  it("takes the period from subscription.activated on the first payment", async () => {
    mocks.verifyWebhook.mockReturnValue(
      waffoEvent({
        id: "evt_activated",
        eventType: "subscription.activated",
        timestamp: RENEWAL_AT,
        data: {
          currentPeriodStart: "2026-09-08",
          currentPeriodEnd: "2026-10-08",
        },
      }),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upserts).toEqual([
      expect.objectContaining({
        waffo_order_id: "ORD_1",
        status: "active",
        period_start: "2026-09-08",
        period_end: "2026-10-08",
      }),
    ]);
  });

  it("rolls the period forward for a renewal payment that no longer carries period fields", async () => {
    mocks.existing = { ...STORED_SUBSCRIPTION };
    mocks.verifyWebhook.mockReturnValue(
      waffoEvent({
        id: "evt_payment",
        eventType: "subscription.payment_succeeded",
        timestamp: RENEWAL_AT,
        data: { paymentDate: "2026-09-08" },
      }),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upserts).toEqual([
      expect.objectContaining({
        waffo_order_id: "ORD_1",
        plan: "monthly",
        status: "active",
        period_start: "2026-09-08",
        period_end: "2026-10-08T00:00:00.000Z",
      }),
    ]);
  });

  it("applies subscription.renewed when the payment event landed first at the same instant", async () => {
    mocks.existing = { ...STORED_SUBSCRIPTION };
    mocks.verifyWebhook.mockReturnValue(
      waffoEvent({
        id: "evt_payment",
        eventType: "subscription.payment_succeeded",
        timestamp: RENEWAL_AT,
        data: { paymentDate: "2026-09-08" },
      }),
    );
    await POST(webhookRequest());

    mocks.existing = {
      ...STORED_SUBSCRIPTION,
      last_event_at: String(mocks.upserts[0]?.["last_event_at"]),
    };
    mocks.verifyWebhook.mockReturnValue(
      waffoEvent({
        id: "evt_renewed",
        eventType: "subscription.renewed",
        timestamp: RENEWAL_AT,
        data: {
          currentPeriodStart: "2026-09-08",
          currentPeriodEnd: "2026-10-08",
        },
      }),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upserts).toHaveLength(2);
    expect(mocks.upserts[1]).toEqual(
      expect.objectContaining({
        status: "active",
        period_start: "2026-09-08",
        period_end: "2026-10-08",
      }),
    );
  });

  it("ignores the retired subscription.updated event", async () => {
    mocks.existing = { ...STORED_SUBSCRIPTION };
    mocks.verifyWebhook.mockReturnValue(
      waffoEvent({
        id: "evt_updated",
        eventType: "subscription.updated",
        timestamp: RENEWAL_AT,
        data: {
          currentPeriodStart: "2026-09-08",
          currentPeriodEnd: "2026-10-08",
        },
      }),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.upserts).toHaveLength(0);
  });
});
