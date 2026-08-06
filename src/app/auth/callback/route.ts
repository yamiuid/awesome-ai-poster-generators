import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

function safeRedirectPath(next: string | null): string {
  if (
    next === null ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/auth")
  ) {
    return "/account";
  }
  return next;
}

function loginWithError(
  origin: string,
  message: string,
  next: string | null,
): NextResponse {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", message);
  if (next) {
    loginUrl.searchParams.set("next", next);
  }
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");

  // Supabase 把认证失败（如链接过期）通过 error 参数带回来
  const errorCode = url.searchParams.get("error_code");
  if (errorCode) {
    return loginWithError(
      url.origin,
      url.searchParams.get("error_description") ??
        "This sign-in link is invalid or has expired. Request a new one.",
      next,
    );
  }
  const error = url.searchParams.get("error");
  if (error) {
    return loginWithError(
      url.origin,
      url.searchParams.get("error_description") ?? error,
      next,
    );
  }

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return loginWithError(url.origin, exchangeError.message, next);
    }
  }

  return NextResponse.redirect(new URL(safeRedirectPath(next), url.origin));
}
