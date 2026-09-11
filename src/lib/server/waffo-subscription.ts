import { type SubscriptionTier, tierForMetadata } from "../domain/plans";

export type SubscriptionPlan = "monthly" | "yearly";
export type { SubscriptionTier } from "@/lib/domain/plans";
export type SubscriptionStatus =
  | "active"
  | "canceling"
  | "canceled"
  | "past_due"
  | "refunded";

export const SUBSCRIPTION_LIFECYCLE_STATES = [
  "none",
  "active",
  "canceling",
  "ended",
  "past_due",
  "stale",
] as const;
export type SubscriptionLifecycleState =
  (typeof SUBSCRIPTION_LIFECYCLE_STATES)[number];

export type SubscriptionStateRecord = Readonly<{
  status: SubscriptionStatus;
  periodEnd: string;
}>;

export type SubscriptionEventCursor = Readonly<{
  orderId: string;
  status: SubscriptionStatus;
  timestamp: string;
  /**
   * 该事件是否携带权威的订阅周期字段（currentPeriodStart / currentPeriodEnd）。
   * 订阅域事件携带，subscription.payment_succeeded 自 2026-09-06 起不再携带。
   */
  carriesPeriod?: boolean;
}>;

export type CurrentSubscriptionCursor = Readonly<{
  orderId: string | null;
  status: SubscriptionStatus;
  periodEnd: string;
  lastEventAt: string | null;
}>;

export function lifecycleState(
  subscription: SubscriptionStateRecord | null | undefined,
  now: Date = new Date(),
): SubscriptionLifecycleState {
  if (!subscription) {
    return "none";
  }
  const hasTimeRemaining =
    new Date(subscription.periodEnd).getTime() > now.getTime();
  switch (subscription.status) {
    case "active":
      return hasTimeRemaining ? "active" : "stale";
    case "canceling":
      return hasTimeRemaining ? "canceling" : "ended";
    case "canceled":
    case "refunded":
      return "ended";
    case "past_due":
      return "past_due";
  }
}

export function canStartCheckout(state: SubscriptionLifecycleState): boolean {
  return state === "none" || state === "ended";
}

export type CheckoutBlock = Readonly<{
  code:
    | "SUBSCRIPTION_ACTIVE"
    | "SUBSCRIPTION_CANCELING"
    | "SUBSCRIPTION_PAST_DUE"
    | "SUBSCRIPTION_STALE";
  message: string;
}>;

export function checkoutBlockFor(
  state: SubscriptionLifecycleState,
): CheckoutBlock | null {
  switch (state) {
    case "none":
    case "ended":
      return null;
    case "active":
      return {
        code: "SUBSCRIPTION_ACTIVE",
        message: "Your subscription is already active.",
      };
    case "canceling":
      return {
        code: "SUBSCRIPTION_CANCELING",
        message: "Choose a new plan after your current period ends.",
      };
    case "past_due":
      return {
        code: "SUBSCRIPTION_PAST_DUE",
        message: "Your billing needs attention. Please contact support.",
      };
    case "stale":
      return {
        code: "SUBSCRIPTION_STALE",
        message:
          "We are confirming your subscription status. Please contact support.",
      };
  }
}

export function shouldApplySubscriptionEvent(
  existing: CurrentSubscriptionCursor | null,
  incoming: SubscriptionEventCursor,
  now: Date = new Date(),
): boolean {
  if (!existing) {
    return true;
  }
  const belongsToAnotherOrder =
    existing.orderId !== null && existing.orderId !== incoming.orderId;
  if (belongsToAnotherOrder) {
    return (
      incoming.status === "active" &&
      canStartCheckout(
        lifecycleState(
          { status: existing.status, periodEnd: existing.periodEnd },
          now,
        ),
      )
    );
  }
  if (existing.lastEventAt === null) {
    return true;
  }
  const incomingAt = new Date(incoming.timestamp).getTime();
  const existingAt = new Date(existing.lastEventAt).getTime();
  if (incomingAt > existingAt) {
    return true;
  }
  // subscription.payment_succeeded 与 subscription.renewed 在同一时刻分别投递、
  // 顺序不保证，且周期字段只存在于订阅域事件上。同刻投递时让携带周期的事件胜出，
  // 否则先到的付款事件会占住 last_event_at，把 renewal 的周期更新丢弃。
  return incomingAt === existingAt && incoming.carriesPeriod === true;
}

export function shouldProcessPaymentEvent(
  isDuplicate: boolean,
  processedAt: string | null,
): boolean {
  return !isDuplicate || processedAt === null;
}

export function periodEnd(start: string, plan: SubscriptionPlan): string {
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (plan === "yearly" ? 12 : 1));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export type SubscriptionPeriodSource = Readonly<{
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  paymentDate?: string;
}>;

export type SubscriptionPeriodFallback = Readonly<{
  start?: string | null;
  end?: string | null;
}>;

/**
 * 解析一笔事件对应的计费周期。
 *
 * 订阅域事件（activated / renewed / recovered / canceling …）携带权威周期字段；
 * subscription.payment_succeeded 自 2026-09-06 起是纯支付事件，不再携带这些字段。
 * 此时按公告口径用 paymentDate + 商品计费周期推断新周期，避免续费后订阅停留在旧
 * 周期、被 lifecycleState 判为 stale 而失去权益。没有新周期信号的事件（如
 * refund.succeeded）沿用已存周期，不做推进。
 */
export function resolvePeriod(
  data: SubscriptionPeriodSource,
  plan: SubscriptionPlan,
  fallback: SubscriptionPeriodFallback,
  timestamp: string,
): Readonly<{ start: string; end: string }> {
  const startFromEvent = nonEmpty(data.currentPeriodStart);
  const endFromEvent = nonEmpty(data.currentPeriodEnd);
  const paidOn = nonEmpty(data.paymentDate);
  const start =
    startFromEvent ?? paidOn ?? nonEmpty(fallback.start) ?? timestamp;
  const hasFreshPeriod =
    startFromEvent !== undefined ||
    endFromEvent !== undefined ||
    paidOn !== undefined;
  const end =
    endFromEvent ??
    (hasFreshPeriod
      ? periodEnd(start, plan)
      : (nonEmpty(fallback.end) ?? periodEnd(start, plan)));
  return { start, end };
}

export function planFor(
  data: Readonly<{
    billingPeriod?: string;
    orderMetadata?: Record<string, string>;
  }>,
  fallback: SubscriptionPlan | null = null,
): SubscriptionPlan | null {
  const metadataPlan = data.orderMetadata?.["plan"];
  if (metadataPlan === "monthly" || metadataPlan === "yearly") {
    return metadataPlan;
  }
  if (data.billingPeriod === "monthly" || data.billingPeriod === "yearly") {
    return data.billingPeriod;
  }
  return fallback;
}

export function tierFor(
  data: Readonly<{
    orderMetadata?: Record<string, string>;
  }>,
  fallback: SubscriptionTier = "creator",
): SubscriptionTier {
  return tierForMetadata(data.orderMetadata, fallback);
}

export function statusFor(
  eventType: string,
  orderStatus?: string,
): SubscriptionStatus | null {
  if (eventType === "refund.succeeded") return "refunded";
  if (eventType === "subscription.canceling") return "canceling";
  if (eventType === "subscription.canceled") return "canceled";
  if (eventType === "subscription.past_due") return "past_due";

  switch (orderStatus) {
    case "canceling":
      return "canceling";
    case "canceled":
    case "closed":
    case "expired":
      return "canceled";
    case "past_due":
      return "past_due";
    default:
      // 不含 `order.completed`：那是一次性订单的付款事件，不是订阅激活。
      return [
        "subscription.activated",
        "subscription.payment_succeeded",
        "subscription.renewed",
        "subscription.recovered",
        "subscription.uncanceled",
      ].includes(eventType)
        ? "active"
        : null;
  }
}
