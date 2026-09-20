import type { SupabaseClient } from "@supabase/supabase-js";
import type { WaffoPancake } from "@waffo/pancake-ts";
import type { Database } from "./supabase/types";
import {
  applyCreditPackEvent,
  applySubscriptionEvent,
  isCreditPackOrder,
  type WaffoEventPayload,
} from "./waffo-event-processing";

/** 事件在库里的滞留时间超过这个值才重放，避免和仍在处理中的请求抢同一条。 */
const REPLAY_MIN_AGE_MS = 2 * 60 * 1_000;
const REPLAY_LIMIT = 50;
const RECONCILE_LIMIT = 25;

export type ReplayResult = Readonly<{
  replayed: number;
  unresolved: number;
  failed: number;
}>;

/**
 * 重放 `payment_events` 里没打上 processed_at 的事件。
 *
 * Waffo 只重投有限次数（默认 3 次），投递失败或处理中 503 之后不会再回来；
 * 没有这步，一笔已付款的续费会永久留在未处理状态。
 */
export async function replayUnprocessedPaymentEvents(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<ReplayResult> {
  const cutoff = new Date(now.getTime() - REPLAY_MIN_AGE_MS).toISOString();
  const { data: rows, error } = await admin
    .from("payment_events")
    .select("waffo_event_id, payload")
    .is("processed_at", null)
    .lt("received_at", cutoff)
    .order("received_at", { ascending: true })
    .limit(REPLAY_LIMIT);
  if (error) {
    throw new Error(`payment_events read failed: ${error.message}`);
  }

  let replayed = 0;
  let unresolved = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const payload = row.payload as Partial<WaffoEventPayload> | null;
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.eventType !== "string" ||
      typeof payload.timestamp !== "string" ||
      !payload.data
    ) {
      // 结构坏掉的记录无法重放，标记掉并留日志，避免每次心跳重复扫到它。
      unresolved += 1;
      console.error("Waffo payment event payload is unusable", {
        eventId: row.waffo_event_id,
      });
      await markProcessed(admin, row.waffo_event_id, now);
      continue;
    }
    try {
      const event = payload as WaffoEventPayload;
      if (isCreditPackOrder(event.data)) {
        await applyCreditPackEvent(admin, event);
      } else {
        await applySubscriptionEvent(admin, event);
      }
      await markProcessed(admin, row.waffo_event_id, now);
      replayed += 1;
    } catch (error) {
      failed += 1;
      console.error("Waffo payment event replay failed", {
        eventId: row.waffo_event_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { replayed, unresolved, failed };
}

async function markProcessed(
  admin: SupabaseClient<Database>,
  eventId: string,
  now: Date,
): Promise<void> {
  const { error } = await admin
    .from("payment_events")
    .update({ processed_at: now.toISOString() })
    .eq("waffo_event_id", eventId);
  if (error) {
    console.error("Waffo payment event could not be marked processed", {
      eventId,
      error: error.message,
    });
  }
}

type SubscriptionOrderQuery = Readonly<{
  subscriptionOrder: Readonly<{
    id: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  }> | null;
}>;

const SUBSCRIPTION_ORDER_QUERY = `query ($id: String!) {
  subscriptionOrder(id: $id) {
    id
    status
    currentPeriodStart
    currentPeriodEnd
  }
}`;

export type ReconcileResult = Readonly<{
  checked: number;
  extended: number;
  failed: number;
}>;

/**
 * 用 Waffo 侧的订单记录自愈「本地已过期、实际仍在付费」的订阅。
 *
 * 只做单向延长：只有在 Waffo 报出的 currentPeriodEnd 比本地更晚时才写回。
 * 这样既能把漏了续费事件、被 lifecycleState 判成 stale 的用户救回来，
 * 也不会因为字段口径差异而误缩短任何人的有效期。
 */
export async function reconcileExpiredSubscriptions(
  admin: SupabaseClient<Database>,
  client: WaffoPancake,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const { data: rows, error } = await admin
    .from("subscriptions")
    .select("user_id, waffo_order_id, period_start, period_end")
    .in("status", ["active", "canceling"])
    .lt("period_end", now.toISOString())
    .limit(RECONCILE_LIMIT);
  if (error) {
    throw new Error(`subscriptions read failed: ${error.message}`);
  }

  let checked = 0;
  let extended = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    if (!row.waffo_order_id) {
      continue;
    }
    checked += 1;
    try {
      const response = await client.graphql.query<SubscriptionOrderQuery>({
        query: SUBSCRIPTION_ORDER_QUERY,
        variables: { id: row.waffo_order_id },
      });
      const order = response.data?.subscriptionOrder;
      if (!order?.currentPeriodEnd) {
        failed += 1;
        continue;
      }
      if (
        new Date(order.currentPeriodEnd).getTime() <=
        new Date(row.period_end).getTime()
      ) {
        continue;
      }
      const currentStart = order.currentPeriodStart;
      const periodStart =
        currentStart &&
        new Date(currentStart).getTime() > new Date(row.period_start).getTime()
          ? currentStart
          : row.period_start;
      const { error: updateError } = await admin
        .from("subscriptions")
        .update({
          period_start: periodStart,
          period_end: order.currentPeriodEnd,
          updated_at: now.toISOString(),
        })
        .eq("user_id", row.user_id);
      if (updateError) {
        failed += 1;
        console.error("Subscription reconciliation write failed", {
          userId: row.user_id,
          error: updateError.message,
        });
        continue;
      }
      extended += 1;
      console.error("Subscription period reconciled from Waffo", {
        userId: row.user_id,
        orderId: row.waffo_order_id,
        from: row.period_end,
        to: order.currentPeriodEnd,
      });
    } catch (error) {
      failed += 1;
      console.error("Subscription reconciliation failed", {
        userId: row.user_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked, extended, failed };
}
