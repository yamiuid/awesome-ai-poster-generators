import { NextResponse } from "next/server";
import { AppError, responseForError } from "@/lib/server/errors";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { verifyWaffoWebhook } from "@/lib/server/waffo";

function periodEnd(start: string, plan: "monthly" | "yearly"): string {
  const date = new Date(start);
  date.setUTCMonth(date.getUTCMonth() + (plan === "yearly" ? 12 : 1));
  return date.toISOString();
}

function planFor(
  data: Readonly<{
    billingPeriod?: string;
    orderMetadata?: Record<string, string>;
  }>,
): "monthly" | "yearly" | null {
  const metadataPlan = data.orderMetadata?.["plan"];
  if (metadataPlan === "monthly" || metadataPlan === "yearly") {
    return metadataPlan;
  }
  if (data.billingPeriod === "monthly" || data.billingPeriod === "yearly") {
    return data.billingPeriod;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    const event = verifyWaffoWebhook(
      rawBody,
      request.headers.get("x-waffo-signature"),
    );
    const admin = createSupabaseAdminClient();
    const { error: eventInsertError } = await admin
      .from("payment_events")
      .insert({
        waffo_event_id: event.eventId,
        event_type: event.eventType,
        event_mode: event.mode,
        payload: {
          eventId: event.eventId,
          eventType: event.eventType,
          mode: event.mode,
        },
      });
    if (eventInsertError && eventInsertError.code !== "23505") {
      throw new AppError(
        "PAYMENT_EVENT_WRITE_FAILED",
        "The payment event could not be recorded.",
        503,
      );
    }
    if (eventInsertError?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const data = event.data;
    const userId =
      data.orderMetadata?.["userId"] ?? data.merchantProvidedBuyerIdentity;
    const handledTypes = new Set([
      "subscription.activated",
      "subscription.payment_succeeded",
      "subscription.updated",
      "subscription.canceling",
      "subscription.uncanceled",
      "subscription.canceled",
      "subscription.past_due",
      "refund.succeeded",
    ]);
    if (userId && handledTypes.has(event.eventType)) {
      const { data: existing } = await admin
        .from("subscriptions")
        .select("last_event_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (
        !existing?.last_event_at ||
        new Date(existing.last_event_at).getTime() <
          new Date(event.timestamp).getTime()
      ) {
        const plan = planFor(data);
        if (plan) {
          const status =
            event.eventType === "subscription.canceling"
              ? "canceling"
              : event.eventType === "subscription.canceled"
                ? "canceled"
                : event.eventType === "subscription.past_due"
                  ? "past_due"
                  : event.eventType === "refund.succeeded"
                    ? "refunded"
                    : "active";
          const start = data.currentPeriodStart ?? event.timestamp;
          const end = data.currentPeriodEnd ?? periodEnd(start, plan);
          const { error: subscriptionError } = await admin
            .from("subscriptions")
            .upsert(
              {
                user_id: userId,
                waffo_order_id: data.orderId,
                waffo_subscription_id: data.orderId,
                plan,
                status,
                activated_at: start,
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
        }
      }
    }
    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("waffo_event_id", event.eventId);
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof AppError) {
      return responseForError(error);
    }
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 503 },
    );
  }
}
