import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { AppError, responseForError } from "@/lib/server/errors";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { getWaffoClient } from "@/lib/server/waffo";

export async function POST(): Promise<Response> {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const { data: subscription, error: readError } = await admin
      .from("subscriptions")
      .select("waffo_order_id, status")
      .eq("user_id", user.userId)
      .maybeSingle();
    if (readError) {
      throw new AppError(
        "SUBSCRIPTION_READ_FAILED",
        "We could not read your subscription.",
        503,
      );
    }
    if (
      !subscription?.waffo_order_id ||
      !["active", "canceling"].includes(subscription.status)
    ) {
      throw new AppError(
        "SUBSCRIPTION_NOT_ACTIVE",
        "There is no active subscription to cancel.",
        409,
      );
    }
    await getWaffoClient().orders.cancelSubscription({
      orderId: subscription.waffo_order_id,
    });
    const { error: updateError } = await admin
      .from("subscriptions")
      .update({ status: "canceling", cancel_at_period_end: true })
      .eq("user_id", user.userId);
    if (updateError) {
      throw new AppError(
        "SUBSCRIPTION_WRITE_FAILED",
        "The cancellation is pending confirmation.",
        503,
      );
    }
    return NextResponse.json({ status: "canceling" });
  } catch (error) {
    if (error instanceof AppError) {
      return responseForError(error);
    }
    return NextResponse.json(
      { error: "The subscription could not be canceled." },
      { status: 503 },
    );
  }
}
