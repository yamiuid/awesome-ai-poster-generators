import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export async function GET(): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ signedIn: false, isPro: false });
  }
  const { data: subscription } = await (await createSupabaseServerClient())
    .from("subscriptions")
    .select("plan, status, period_end, cancel_at_period_end")
    .eq("user_id", auth.userId)
    .maybeSingle();
  return NextResponse.json({ signedIn: true, isPro: auth.isPro, subscription });
}
