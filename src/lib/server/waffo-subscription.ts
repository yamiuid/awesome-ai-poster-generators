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
  return (
    existing.lastEventAt === null ||
    new Date(incoming.timestamp).getTime() >
      new Date(existing.lastEventAt).getTime()
  );
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
      return [
        "order.completed",
        "subscription.activated",
        "subscription.payment_succeeded",
        "subscription.updated",
        "subscription.uncanceled",
      ].includes(eventType)
        ? "active"
        : null;
  }
}
