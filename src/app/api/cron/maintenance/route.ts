import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";
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
    await admin.storage
      .from("posters")
      .remove(expiredAssets.map((asset) => asset.storage_path));
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
      await admin.storage
        .from("posters")
        .remove(assets.map((asset) => asset.storage_path));
      await admin
        .from("generated_assets")
        .delete()
        .in(
          "id",
          assets.map((asset) => asset.id),
        );
    }
  }

  const timeoutBefore = new Date(now.getTime() - 15 * 60 * 1_000).toISOString();
  const { data: staleGenerations } = await admin
    .from("generations")
    .select("id, mode, guest_key")
    .in("status", ["submitted", "processing"])
    .lt("submitted_at", timeoutBefore)
    .limit(100);
  for (const generation of staleGenerations ?? []) {
    await admin
      .from("generations")
      .update({
        status: "timed_out",
        progress: 100,
        reserved_credits: 0,
        error_message:
          "This generation timed out and your credits were returned.",
        completed_at: now.toISOString(),
      })
      .eq("id", generation.id);
    if (generation.mode === "pro") {
      await admin.rpc("settle_credits", {
        p_generation_id: generation.id,
        p_successful_images: 0,
        p_cost_per_image: 0,
      });
    } else if (generation.guest_key) {
      await admin.rpc("release_guest_generation", {
        p_guest_key: generation.guest_key,
      });
    }
  }
  return NextResponse.json({
    deletedAssets: expiredAssets?.length ?? 0,
    timedOutGenerations: staleGenerations?.length ?? 0,
  });
}
