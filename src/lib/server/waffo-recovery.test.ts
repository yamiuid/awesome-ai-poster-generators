import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reconcileExpiredSubscriptions,
  replayUnprocessedPaymentEvents,
} from "./waffo-recovery";

const mocks = vi.hoisted(() => ({
  applied: [] as Array<Record<string, unknown>>,
  credited: [] as Array<Record<string, unknown>>,
  applyError: null as Error | null,
  paymentRows: [] as Array<{ waffo_event_id: string; payload: unknown }>,
  paymentReadError: null as { message: string } | null,
  processedIds: [] as string[],
  subRows: [] as Array<Record<string, unknown>>,
  subUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("./waffo-event-processing", () => ({
  applyCreditPackEvent: async (
    _admin: unknown,
    event: Record<string, unknown>,
  ) => {
    mocks.credited.push(event);
  },
  applySubscriptionEvent: async (
    _admin: unknown,
    event: Record<string, unknown>,
  ) => {
    if (mocks.applyError) {
      throw mocks.applyError;
    }
    mocks.applied.push(event);
  },
  isCreditPackOrder: (data: Record<string, unknown>) =>
    (data["orderMetadata"] as Record<string, unknown> | undefined)?.["kind"] ===
    "credit_pack",
}));

function adminMock() {
  return {
    from: (table: string) =>
      table === "payment_events"
        ? {
            select: () => ({
              is: () => ({
                lt: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: mocks.paymentRows,
                        error: mocks.paymentReadError,
                      }),
                  }),
                }),
              }),
            }),
            update: () => ({
              eq: (_column: string, id: string) => {
                mocks.processedIds.push(id);
                return Promise.resolve({ error: null });
              },
            }),
          }
        : {
            select: () => ({
              in: () => ({
                lt: () => ({
                  limit: () =>
                    Promise.resolve({ data: mocks.subRows, error: null }),
                }),
              }),
            }),
            update: (row: Record<string, unknown>) => ({
              eq: (_column: string, userId: string) => {
                mocks.subUpdates.push({ userId, ...row });
                return Promise.resolve({ error: null });
              },
            }),
          },
  } as never;
}

const NOW = new Date("2026-09-11T00:00:00.000Z");

function event(id: string, eventType: string): Record<string, unknown> {
  return {
    id,
    eventType,
    timestamp: "2026-09-08T04:20:43.300Z",
    data: { orderId: "ORD_1" },
  };
}

describe("replayUnprocessedPaymentEvents", () => {
  beforeEach(() => {
    mocks.applied.length = 0;
    mocks.credited.length = 0;
    mocks.applyError = null;
    mocks.paymentRows.length = 0;
    mocks.paymentReadError = null;
    mocks.processedIds.length = 0;
  });

  it("replays an unprocessed event and marks it processed", async () => {
    mocks.paymentRows.push({
      waffo_event_id: "evt_1",
      payload: event("evt_1", "subscription.renewed"),
    });

    const result = await replayUnprocessedPaymentEvents(adminMock(), NOW);

    expect(result).toEqual({ replayed: 1, unresolved: 0, failed: 0 });
    expect(mocks.applied).toHaveLength(1);
    expect(mocks.processedIds).toEqual(["evt_1"]);
  });

  it("keeps a failing event pending for the next run", async () => {
    mocks.applyError = new Error("waffo upgrade in progress");
    mocks.paymentRows.push({
      waffo_event_id: "evt_2",
      payload: event("evt_2", "subscription.renewed"),
    });

    const result = await replayUnprocessedPaymentEvents(adminMock(), NOW);

    expect(result).toEqual({ replayed: 0, unresolved: 0, failed: 1 });
    expect(mocks.processedIds).toEqual([]);
  });

  it("replays a credit-pack event through the credit grant handler", async () => {
    mocks.paymentRows.push({
      waffo_event_id: "evt_pack",
      payload: {
        id: "evt_pack",
        eventType: "order.completed",
        timestamp: "2026-09-08T04:20:43.300Z",
        data: {
          orderId: "ORD_PACK",
          orderMetadata: { kind: "credit_pack" },
        },
      },
    });

    const result = await replayUnprocessedPaymentEvents(adminMock(), NOW);

    expect(result).toEqual({ replayed: 1, unresolved: 0, failed: 0 });
    expect(mocks.credited).toHaveLength(1);
    expect(mocks.applied).toHaveLength(0);
    expect(mocks.processedIds).toEqual(["evt_pack"]);
  });

  it("retires an unusable payload instead of rescanning it forever", async () => {
    mocks.paymentRows.push({ waffo_event_id: "evt_3", payload: null });

    const result = await replayUnprocessedPaymentEvents(adminMock(), NOW);

    expect(result).toEqual({ replayed: 0, unresolved: 1, failed: 0 });
    expect(mocks.processedIds).toEqual(["evt_3"]);
  });

  it("surfaces a read failure so the cron can log it", async () => {
    mocks.paymentReadError = { message: "connection reset" };

    await expect(
      replayUnprocessedPaymentEvents(adminMock(), NOW),
    ).rejects.toThrow(/payment_events read failed/);
  });
});

describe("reconcileExpiredSubscriptions", () => {
  const client = (order: unknown) =>
    ({
      graphql: {
        query: vi
          .fn()
          .mockResolvedValue({ data: { subscriptionOrder: order } }),
      },
    }) as never;

  beforeEach(() => {
    mocks.subRows.length = 0;
    mocks.subUpdates.length = 0;
  });

  it("extends an expired local period when Waffo still has time left", async () => {
    mocks.subRows.push({
      user_id: "user-1",
      waffo_order_id: "ORD_1",
      period_start: "2026-08-06T00:00:00.000Z",
      period_end: "2026-09-06T00:00:00.000Z",
    });

    const result = await reconcileExpiredSubscriptions(
      adminMock(),
      client({
        id: "ORD_1",
        status: "active",
        currentPeriodStart: "2026-09-06",
        currentPeriodEnd: "2026-10-06",
      }),
      NOW,
    );

    expect(result).toEqual({ checked: 1, extended: 1, failed: 0 });
    expect(mocks.subUpdates).toEqual([
      {
        userId: "user-1",
        period_start: "2026-09-06",
        period_end: "2026-10-06",
        updated_at: NOW.toISOString(),
      },
    ]);
  });

  it("never shortens a period that is already further ahead", async () => {
    mocks.subRows.push({
      user_id: "user-1",
      waffo_order_id: "ORD_1",
      period_start: "2026-09-06T00:00:00.000Z",
      period_end: "2026-10-06T00:00:00.000Z",
    });

    const result = await reconcileExpiredSubscriptions(
      adminMock(),
      client({
        id: "ORD_1",
        status: "active",
        currentPeriodStart: "2026-08-06",
        currentPeriodEnd: "2026-09-06",
      }),
      NOW,
    );

    expect(result).toEqual({ checked: 1, extended: 0, failed: 0 });
    expect(mocks.subUpdates).toHaveLength(0);
  });

  it("counts an order Waffo cannot resolve as a failure", async () => {
    mocks.subRows.push({
      user_id: "user-1",
      waffo_order_id: "ORD_missing",
      period_start: "2026-08-06T00:00:00.000Z",
      period_end: "2026-09-06T00:00:00.000Z",
    });

    const result = await reconcileExpiredSubscriptions(
      adminMock(),
      client(null),
      NOW,
    );

    expect(result).toEqual({ checked: 1, extended: 0, failed: 1 });
  });
});
