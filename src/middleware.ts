import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  isUserPagePath,
  localeFromPath,
  stripLocalePrefix,
} from "@/lib/i18n/locale";
import { getPublicEnv } from "@/lib/server/supabase/public-env";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const locale = localeFromPath(pathname);
  const hasLocalePrefix = stripLocalePrefix(pathname) !== pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-locale", locale);
  if (hasLocalePrefix && !isUserPagePath(pathname)) {
    const unlocalizedUrl = request.nextUrl.clone();
    unlocalizedUrl.pathname = stripLocalePrefix(pathname);
    return NextResponse.redirect(unlocalizedUrl);
  }
  const response =
    hasLocalePrefix && isUserPagePath(pathname)
      ? (() => {
          const rewrittenUrl = request.nextUrl.clone();
          rewrittenUrl.pathname = stripLocalePrefix(pathname);
          return NextResponse.rewrite(rewrittenUrl, {
            request: { headers: requestHeaders },
          });
        })()
      : NextResponse.next({ request: { headers: requestHeaders } });
  let publicEnv: Readonly<{ url: string; anonKey: string }>;
  try {
    publicEnv = getPublicEnv();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return response;
    }
    throw error;
  }
  const supabase = createServerClient(publicEnv.url, publicEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(values) {
        for (const { name, value, options } of values) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // 只保留「需要时刷新会话 + 校验令牌」的作用：
  // getClaims() 对 ES256 令牌走本地 JWKS 验签，省掉每次请求到 Auth 服务器的一次往返；
  // 令牌临近过期时它仍会先刷新会话，所以 cookie 刷新行为不变。
  try {
    await supabase.auth.getClaims();
  } catch (error) {
    // JWKS 拉取失败不该让整站 500：页面自身的鉴权路径会再处理一次
    console.error("Middleware session verification failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
