import { NextResponse } from "next/server";
import { AppError, responseForError } from "@/lib/server/errors";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { verifyWaffoWebhook } from "@/lib/server/waffo";
import { applySubscriptionEvent } from "@/lib/server/waffo-event-processing";
import { shouldProcessPaymentEvent } from "@/lib/server/waffo-subscription";

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
    const isDuplicate = eventInsertError?.code === "23505";
    let processedAt: string | null = null;
    if (isDuplicate) {
      const { data: existingEvent, error: eventReadError } = await admin
        .from("payment_events")
        .select("processed_at")
        .eq("waffo_event_id", event.id)
        .maybeSingle();
      if (eventReadError || !existingEvent) {
        throw new AppError(
          "PAYMENT_EVENT_READ_FAILED",
          "The payment event state could not be read.",
          503,
        );
      }
      processedAt = existingEvent.processed_at;
    }
    if (!shouldProcessPaymentEvent(isDuplicate, processedAt)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await applySubscriptionEvent(admin, event);
    const { error: processedError } = await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("waffo_event_id", event.id);
    if (processedError) {
      throw new AppError(
        "PAYMENT_EVENT_WRITE_FAILED",
        "The payment event could not be marked as processed.",
        503,
      );
    }
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
