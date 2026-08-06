import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/server/supabase/public-env";
import type { Database } from "@/lib/server/supabase/types";

type CookieOptions = {
  maxAge?: number;
  domain?: string;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

type CookieTuple = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * PKCE 的 code_verifier 必须存在 cookie 而不是 localStorage：
 * 用户点击邮件链接时，服务端 auth/callback 需要读取同一个 verifier 完成换码。
 * localStorage 只在同一标签页/会话可用，cookie 在同一浏览器跨页面可用，
 * 且服务端（@supabase/ssr）也能读到。
 */
function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") {
    return [];
  }
  return document.cookie
    .split(";")
    .map((pair) => {
      const [name, ...rest] = pair.trim().split("=");
      return { name: name ?? "", value: decodeURIComponent(rest.join("=")) };
    })
    .filter((cookie) => cookie.name !== "");
}

function setAllCookies(cookies: CookieTuple[]): void {
  if (typeof document === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:";
  for (const cookie of cookies) {
    let value = `${cookie.name}=${encodeURIComponent(cookie.value)}`;
    const options = cookie.options;
    if (options?.maxAge) {
      value += `; Max-Age=${options.maxAge}`;
    }
    if (options?.domain) {
      value += `; Domain=${options.domain}`;
    }
    value += `; Path=${options?.path ?? "/"}`;
    if (options?.sameSite) {
      value += `; SameSite=${options.sameSite}`;
    }
    // 仅 https 下设置 Secure，否则 localhost http 下 cookie 不会被保存
    if (secure) {
      value += "; Secure";
    }
    document.cookie = value;
  }
}

let browserClient: SupabaseClient<Database> | undefined;

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const publicEnv = getPublicEnv();
  browserClient = createBrowserClient<Database>(
    publicEnv.url,
    publicEnv.anonKey,
    {
      cookies: {
        getAll: getAllCookies,
        setAll: setAllCookies,
      },
    },
  );
  return browserClient;
}
