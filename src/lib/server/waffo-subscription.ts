import { type SubscriptionTier, tierForMetadata } from "../domain/plans";

export type SubscriptionPlan = "monthly" | "yearly";
export type { SubscriptionTier } from "@/lib/domain/plans";
export type SubscriptionStatus =
  | "active"
  | "canceling"
  | "canceled"
  | "past_due"
  | "refunded";

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
