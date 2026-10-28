import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server/env";
import { recoverGeneration } from "@/lib/server/generation-poll";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${getServerEnv().CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await createSupabaseAdminClient()
    .from("generations")
    .select("id")
    .in("status", ["submitted", "processing"])
    .lte("next_poll_at", new Date().toISOString())
    .order("next_poll_at", { ascending: true })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "Pending generations could not be read." }, { status: 503 });
  }
  const results = await Promise.allSettled((data ?? []).map(({ id }) => recoverGeneration(id)));
  const failed = results.filter((result) => result.status === "rejected");
  for (const result of failed) {
    if (result.status === "rejected") console.error("Generation recovery failed", result.reason);
  }
  return NextResponse.json({ recovered: results.length - failed.length, failed: failed.length });
}
