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
    try {
      const supabase = await createSupabaseServerClient();
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return loginWithError(url.origin, exchangeError.message, next);
      }
    } catch (exchangeFailure) {
      // exchangeCodeForSession 可能抛异常（如 verifier/state 校验失败、网络异常），
      // 必须兜底回登录页显示原因，否则 route handler 直接 500 白屏。
      const reason =
        exchangeFailure instanceof Error
          ? exchangeFailure.message
          : "The sign-in could not be completed. Please try again.";
      return loginWithError(url.origin, reason, next);
    }
  }

  return NextResponse.redirect(new URL(safeRedirectPath(next), url.origin));
}
