import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent, WebhookEventData } from "@waffo/pancake-ts";
import { AppError } from "./errors";
import type { Database } from "./supabase/types";
import {
  planFor,
  resolvePeriod,
  shouldApplySubscriptionEvent,
  statusFor,
  tierFor,
} from "./waffo-subscription";

/**
 * 会改写订阅状态的事件白名单。
 *
 * 刻意不含 `order.completed`：那是「一次性订单首次付款成功」，本产品只卖订阅，
 * 把一次性订单当成订阅激活会给老订阅用户白送 Pro 和整月积分。
 * 也不含已废弃的 `subscription.updated`——Waffo 现在用下面的订阅域事件承载状态。
 */
export const HANDLED_SUBSCRIPTION_EVENTS: ReadonlySet<string> = new Set([
  "subscription.activated",
  "subscription.payment_succeeded",
  "subscription.renewed",
  "subscription.recovered",
  "subscription.canceling",
  "subscription.uncanceled",
  "subscription.canceled",
  "subscription.past_due",
  "refund.succeeded",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WaffoEventPayload = Pick<
  WebhookEvent<WebhookEventData>,
  "eventType" | "timestamp" | "data"
>;

/**
 * 从事件里解析本应用的账号 ID。
 *
 * checkout 会同时写 `metadata.userId` 和 uuid 形态的 `buyerIdentity`；后台手工
 * 创建、或用邮箱当身份的订单两者都不是。这类订单无法映射到账号，必须拒绝，
 * 否则会拿邮箱去比 uuid 列、把写失败的 503 变成永久重试。
 */
export function resolveEventUserId(
  data: Pick<
    WebhookEventData,
    "orderMetadata" | "merchantProvidedBuyerIdentity"
  >,
): string | null {
  const candidate =
    data.orderMetadata?.["userId"] ?? data.merchantProvidedBuyerIdentity;
  return typeof candidate === "string" && UUID_PATTERN.test(candidate)
    ? candidate
    : null;
}

export type SubscriptionEventOutcome = "applied" | "skipped";

/**
 * 把一条 Waffo 订阅事件落到 `subscriptions`。幂等：重复投递同一条事件不会重复写入。
 *
 * 抛 `AppError` 表示「现在失败但值得重试」（读库/写库故障），调用方应返回 503，
 * 让 Waffo 重投、并留给对账任务重放。返回 `skipped` 表示这条事件不该改状态。
 */
export async function applySubscriptionEvent(
  admin: SupabaseClient<Database>,
  event: WaffoEventPayload,
): Promise<SubscriptionEventOutcome> {
  if (!HANDLED_SUBSCRIPTION_EVENTS.has(event.eventType)) {
    return "skipped";
  }
  const data = event.data;
  const userId = resolveEventUserId(data);
  if (!userId) {
    // 不是本应用 checkout 创建的订单（例如在 Waffo 后台手工下单）。
    // 无法自动补权益，记日志并放行，避免 Waffo 无限重投一条永远处理不了的事件。
    console.error("Waffo event without a mappable account", {
      eventType: event.eventType,
      orderId: data.orderId,
      orderMerchantExternalId: data.orderMerchantExternalId ?? null,
      hasMetadataUserId: Boolean(data.orderMetadata?.["userId"]),
    });
    return "skipped";
  }

  const { data: existing, error: readError } = await admin
    .from("subscriptions")
    .select(
      "waffo_order_id, last_event_at, activated_at, period_start, period_end, plan, tier, status",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    // 读失败曾被当成「没有订阅」，从而绕过跨订单与事件时序两道保护。
    throw new AppError(
      "SUBSCRIPTION_READ_FAILED",
      "We could not read your subscription.",
      503,
    );
  }

  const plan = planFor(data, existing?.plan ?? null);
  const tier = tierFor(data, existing?.tier ?? "creator");
  const status = statusFor(event.eventType, data.orderStatus);
  const carriesPeriod = Boolean(
    data.currentPeriodStart || data.currentPeriodEnd,
  );
  const shouldApply =
    status !== null &&
    shouldApplySubscriptionEvent(
      existing
        ? {
            orderId: existing.waffo_order_id,
            status: existing.status,
            periodEnd: existing.period_end,
            lastEventAt: existing.last_event_at,
          }
        : null,
      {
        orderId: data.orderId,
        status,
        timestamp: event.timestamp,
        carriesPeriod,
      },
    );
  if (!plan || !status || !shouldApply) {
    return "skipped";
  }

  const { start: resolvedStart, end: resolvedEnd } = resolvePeriod(
    data,
    plan,
    existing && existing.waffo_order_id === data.orderId
      ? { start: existing.period_start, end: existing.period_end }
      : {},
    event.timestamp,
  );

  let start = resolvedStart;
  let end = resolvedEnd;
  let activatedAt = resolvedStart;
  if (existing && existing.waffo_order_id === data.orderId) {
    // 同一笔订阅的首次激活时间保持不变，积分窗口不再被每次事件重新锚定。
    activatedAt = existing.activated_at ?? resolvedStart;
    // 只向前推进周期：Waffo 的续费回执可能带回「已经结束」的周期
    // （2026-09 的 payment_succeeded 实测样本），照抄会把还在付费的用户判成过期。
    if (
      new Date(resolvedEnd).getTime() < new Date(existing.period_end).getTime()
    ) {
      start = existing.period_start;
      end = existing.period_end;
    }
  }

  const { error: subscriptionError } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      waffo_order_id: data.orderId,
      waffo_subscription_id: data.orderId,
      plan,
      tier,
      status,
      activated_at: activatedAt,
      period_start: start,
      period_end: end,
      cancel_at_period_end: status === "canceling",
      last_event_at: event.timestamp,
    },
    { onConflict: "user_id" },
  );
  if (subscriptionError) {
    throw new AppError(
      "SUBSCRIPTION_WRITE_FAILED",
      "The subscription could not be updated.",
      503,
    );
  }
  return "applied";
}
