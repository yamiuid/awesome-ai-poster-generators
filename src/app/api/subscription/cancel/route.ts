import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { AppError, responseForError } from "@/lib/server/errors";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { getWaffoClient } from "@/lib/server/waffo";
import { lifecycleState } from "@/lib/server/waffo-subscription";

export async function POST(): Promise<Response> {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const { data: subscription, error: readError } = await admin
      .from("subscriptions")
      .select("waffo_order_id, status, period_end")
      .eq("user_id", user.userId)
      .maybeSingle();
    if (readError) {
      throw new AppError(
        "SUBSCRIPTION_READ_FAILED",
        "We could not read your subscription.",
        503,
      );
    }
    const state = subscription
      ? lifecycleState({
          status: subscription.status,
          periodEnd: subscription.period_end,
        })
      : "none";
    if (state === "canceling") {
      return NextResponse.json({ status: "canceling" });
    }
    if (state !== "active" || !subscription || !subscription.waffo_order_id) {
      throw new AppError(
        "SUBSCRIPTION_NOT_ACTIVE",
        "There is no active subscription to cancel.",
        409,
      );
    }
    // pending 的订单会被立刻关闭（canceled）；已生效的订阅排到本期末（canceling）。
    // 以 Waffo 的返回为准，别把两种结果都写成 canceling。
    const canceled = await getWaffoClient().orders.cancelSubscription({
      orderId: subscription.waffo_order_id,
    });
    const status = canceled.status === "canceled" ? "canceled" : "canceling";
    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        status,
        cancel_at_period_end: status === "canceling",
      })
      .eq("user_id", user.userId);
    if (updateError) {
      throw new AppError(
        "SUBSCRIPTION_WRITE_FAILED",
        "The cancellation is pending confirmation.",
        503,
      );
    }
    return NextResponse.json({ status });
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
