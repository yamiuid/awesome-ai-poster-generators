import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";
import { recoverGeneration } from "@/lib/server/generation-poll";
import { deletePoster } from "@/lib/server/storage";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";

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

  const { data: canceledSubscriptions } = await admin
    .from("subscriptions")
    .select("user_id, period_end")
    .in("status", ["canceled", "refunded"])
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
    recoveredGenerations,
    failedRecoveries,
  });
}
