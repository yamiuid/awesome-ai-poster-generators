import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    await (await createSupabaseServerClient()).auth.exchangeCodeForSession(
      code,
    );
  }
  return NextResponse.redirect(new URL("/account", url.origin));
}
