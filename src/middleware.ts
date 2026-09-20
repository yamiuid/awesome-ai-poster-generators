import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_LOCALE,
  isUserPagePath,
  localeFromPath,
  localizedPath,
  stripLocalePrefix,
  UI_LOCALES,
  type UiLocale,
} from "@/lib/i18n/locale";
import { getPublicEnv } from "@/lib/server/supabase/public-env";

/**
 * 路由前缀策略（等价于 next-intl 的 localePrefix: "as-needed"）：
 *
 * - 页面真实路径是 /[locale]/…，默认语言 en 不带前缀（/en/about → 301 /about）
 * - /about       → 内部 rewrite 到 /en/about（浏览器地址栏不变）
 * - /ja/about    → 直接命中 /[locale]/about
 * - /ja/privacy  → 301 /privacy（法务页不做本地化）
 *
 * 这里**不再往请求头写 x-site-locale**：语言改由路由段决定，根布局因此不再读
 * 请求头，静态页才能预渲染。中间件只剩两件事：URL 规范化 + 会话 cookie 刷新。
 */

const LOCALE_PREFIX = new RegExp(`^/(${UI_LOCALES.join("|")})(?=/|$)`);
/** 末段带扩展名的请求（robots.txt / sitemap.xml / og.png …）不参与本地化 */
const FILE_PATH = /\.[^/]*$/;
/** 仍然在服务端读登录态的路径：只有这些需要在这里刷新 Supabase 会话 cookie */
const SESSION_PATHS = ["/account", "/checkout"] as const;

function isLocalizedRoute(pathname: string): boolean {
  return !FILE_PATH.test(pathname) && isUserPagePath(pathname);
}

function needsSessionRefresh(pathname: string): boolean {
  return SESSION_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * 会话续期只作用于上面那少数几个服务端鉴权页。
 * 营销页 / 首页 / 风格落地页改成静态后由浏览器端自行续期
 * （supabase-js 的 getSession、onAuthStateChange 都会写回 cookie），
 * 中间件不必再为每一次访问付一次 JWKS 验签。
 */
async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
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

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const prefix = LOCALE_PREFIX.exec(pathname);
  const locale: UiLocale = prefix ? localeFromPath(pathname) : DEFAULT_LOCALE;
  const rest = prefix ? stripLocalePrefix(pathname) : pathname;

  if (prefix) {
    // 默认语言前缀、以及不该本地化的路径（法务页 / 静态文件），统一 301 回无前缀地址
    if (locale === DEFAULT_LOCALE || !isLocalizedRoute(rest)) {
      const canonical = request.nextUrl.clone();
      canonical.pathname = rest;
      return NextResponse.redirect(canonical, 301);
    }
    return needsSessionRefresh(rest)
      ? refreshSession(request, NextResponse.next())
      : NextResponse.next();
  }

  // Supabase 的 site_url 兜底会把登录失败落到根路径（?error=…），转发到登录页
  if (rest === "/") {
    const error =
      request.nextUrl.searchParams.get("error_description") ??
      request.nextUrl.searchParams.get("error");
    if (error) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = localizedPath("/login", locale);
      loginUrl.search = `?error=${encodeURIComponent(error)}`;
      return NextResponse.redirect(loginUrl, 307);
    }
  }

  if (!isLocalizedRoute(rest)) {
    return NextResponse.next();
  }

  // 默认语言补前缀：内部 rewrite，地址栏保持 /about
  const localized = request.nextUrl.clone();
  localized.pathname =
    rest === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${rest}`;
  return needsSessionRefresh(rest)
    ? refreshSession(request, NextResponse.rewrite(localized))
    : NextResponse.rewrite(localized);
}

export const config = {
  // api / auth 由各自 route handler 处理登录态刷新，根级静态文件也不进中间件
  matcher: ["/((?!api/|auth/|_next/|.*\\.[^/]*$).*)"],
};
