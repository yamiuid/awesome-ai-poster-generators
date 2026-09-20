import { loginRedirectPath } from "@/lib/domain/navigation";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

/**
 * 用 200 的 HTML 跳转页代替 3xx 重定向。
 *
 * vinext 的 route handler 管道会把返回的重定向再当成请求去跟随：同一个回调
 * 处理器在一次请求里被执行十几次，最后抛 "Too many redirects" → 500（同一段
 * 代码在 Vercel 上正常返回 307）。没有 Location 头就不会触发那条路径。
 * 跳转目标始终是站内相对路径（loginRedirectPath 已校验），这里再做一次
 * HTML/脚本上下文的转义。
 */
const NAVIGATE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function navigateTo(pathWithQuery: string): Response {
  const target = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const attribute = escapeHtml(target);
  const script = JSON.stringify(target).replaceAll("<", "\\u003c");
  const body = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="robots" content="noindex">',
    `<meta http-equiv="refresh" content="0;url=${attribute}">`,
    "<title>Redirecting…</title></head><body>",
    `<p>Redirecting… <a href="${attribute}">Continue</a></p>`,
    `<script>location.replace(${script});</script>`,
    "</body></html>",
  ].join("");
  return new Response(body, { status: 200, headers: NAVIGATE_HEADERS });
}

function loginWithError(
  origin: string,
  message: string,
  next: string | null,
): Response {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", message);
  if (next) {
    loginUrl.searchParams.set("next", next);
  }
  return navigateTo(`${loginUrl.pathname}${loginUrl.search}`);
}

export async function GET(request: Request): Promise<Response> {
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

  return navigateTo(loginRedirectPath(next));
}
