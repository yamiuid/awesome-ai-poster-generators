import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";
import { recoverGeneration } from "@/lib/server/generation-poll";
import {
  deletePoster,
  deleteReference,
  listStaleReferences,
} from "@/lib/server/storage";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { getWaffoClient } from "@/lib/server/waffo";
import {
  reconcileExpiredSubscriptions,
  replayUnprocessedPaymentEvents,
} from "@/lib/server/waffo-recovery";

// 兜底扫描会真的补做落库（下载 provider 图片 + 加水印 + 上传 R2），
// 一批 100 条时默认时长不够用
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const expiredBefore = now.toISOString();
  const { data: expiredAssets } = await admin
    .from("generated_assets")
    .select("id, storage_path")
    .not("expires_at", "is", null)
    .lt("expires_at", expiredBefore)
    .limit(500);
  if (expiredAssets && expiredAssets.length > 0) {
    await deletePoster(expiredAssets.map((asset) => asset.storage_path));
    await admin
      .from("generated_assets")
      .delete()
      .in(
        "id",
        expiredAssets.map((asset) => asset.id),
      );
  }

  // 订阅结束后的图片保留：文档承诺「Pro 图片在订阅有效期内保留，取消后 30 天宽限期」。
  // 必须把 canceling 也算进来：到期未续费的订阅会一直停在 canceling
  // （reconcileExpiredSubscriptions 只会延长周期，不会把它改成 canceled），
  // 只筛 canceled/refunded 会让这批用户的图片永久留在存储里。
  const { data: canceledSubscriptions } = await admin
    .from("subscriptions")
    .select("user_id, period_end")
    .in("status", ["canceled", "refunded", "canceling"])
    .limit(200);
  for (const subscription of canceledSubscriptions ?? []) {
    const retentionEnd = new Date(
      new Date(subscription.period_end).getTime() + 30 * 24 * 60 * 60 * 1_000,
    );
    if (retentionEnd > now) continue;
    const { data: assets } = await admin
      .from("generated_assets")
      .select("id, storage_path")
      .eq("user_id", subscription.user_id);
    if (assets && assets.length > 0) {
      await deletePoster(assets.map((asset) => asset.storage_path));
      await admin
        .from("generated_assets")
        .delete()
        .in(
          "id",
          assets.map((asset) => asset.id),
        );
    }
  }

  // 参考图（图生图上传件）：30 天后清理，失败不阻断后续任务
  let deletedReferences = 0;
  try {
    const staleReferences = await listStaleReferences(
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000),
    );
    for (let index = 0; index < staleReferences.length; index += 500) {
      await deleteReference(staleReferences.slice(index, index + 500));
    }
    deletedReferences = staleReferences.length;
  } catch (error) {
    console.error("Reference image cleanup failed", error);
  }

  // 支付对账：先重放投递失败/处理中断的结算事件，再用 Waffo 侧订单自愈过期订阅。
  // 任一步失败都不能影响下面的资产清理与生成恢复。
  let paymentEvents = { replayed: 0, unresolved: 0, failed: 0 };
  let subscriptions = { checked: 0, extended: 0, failed: 0 };
  try {
    paymentEvents = await replayUnprocessedPaymentEvents(admin, now);
  } catch (error) {
    console.error("Payment event replay failed", error);
  }
  try {
    subscriptions = await reconcileExpiredSubscriptions(
      admin,
      getWaffoClient(),
      now,
    );
  } catch (error) {
    console.error("Subscription reconciliation failed", error);
  }

  const { data: pendingGenerations, error: pendingError } = await admin
    .from("generations")
    .select("id")
    .in("status", ["submitted", "processing"])
    .lte("next_poll_at", now.toISOString())
    .limit(100);
  if (pendingError) {
    return NextResponse.json(
      { error: "Pending generations could not be read." },
      { status: 503 },
    );
  }
  let recoveredGenerations = 0;
  let failedRecoveries = 0;
  // 并发恢复挂起任务，避免串行调外部 API 超时；失败不中断其余任务
  const pending = pendingGenerations ?? [];
  const results = await Promise.allSettled(
    pending.map((generation) => recoverGeneration(generation.id)),
  );
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      recoveredGenerations += 1;
    } else {
      failedRecoveries += 1;
      const generationId = pending[index]?.id;
      console.error("Generation recovery failed", generationId, result.reason);
    }
  }
  return NextResponse.json({
    deletedAssets: expiredAssets?.length ?? 0,
    deletedReferences,
    recoveredGenerations,
    failedRecoveries,
    paymentEvents,
    subscriptions,
  });
}
