import { NextResponse } from "next/server";
import { AppError, responseForError } from "@/lib/server/errors";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { verifyWaffoWebhook } from "@/lib/server/waffo";
import { periodEnd, planFor, statusFor } from "@/lib/server/waffo-subscription";

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
        waffo_event_id: event.id,
        event_type: event.eventType,
        event_mode: event.mode,
        payload: JSON.parse(rawBody),
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
      "order.completed",
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
        .select("last_event_at, period_start, period_end, plan")
        .eq("user_id", userId)
        .maybeSingle();
      if (
        !existing?.last_event_at ||
        new Date(existing.last_event_at).getTime() <
          new Date(event.timestamp).getTime()
      ) {
        const plan = planFor(data, existing?.plan ?? null);
        const status = statusFor(event.eventType, data.orderStatus);
        if (plan && status) {
          const start =
            data.currentPeriodStart ??
            existing?.period_start ??
            event.timestamp;
          const end =
            data.currentPeriodEnd ??
            existing?.period_end ??
            periodEnd(start, plan);
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
      .eq("waffo_event_id", event.id);
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
