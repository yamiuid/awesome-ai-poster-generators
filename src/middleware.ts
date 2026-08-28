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

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
