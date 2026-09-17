import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "./env";

export const GUEST_COOKIE = "tp_guest";
const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type GuestIdentity = Readonly<{
  cookieValue: string;
  key: string;
  limitKey: string;
  legacyKey: string;
}>;

function digest(value: string): string {
  return createHmac("sha256", getServerEnv().RATE_LIMIT_PEPPER)
    .update(value)
    .digest("hex");
}

export function getGuestIdentity(request: NextRequest): GuestIdentity {
  const cookieValue = request.cookies.get(GUEST_COOKIE)?.value ?? randomUUID();
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const legacyKey = digest(`${cookieValue}:${forwarded}:${userAgent}`);
  return {
    cookieValue,
    key: digest(cookieValue),
    limitKey: digest(cookieValue),
    legacyKey,
  };
}

export function getGuestKey(request: NextRequest): string {
  return getGuestIdentity(request).key;
}

/**
 * 把访客身份固化到响应上。
 *
 * 过去只有「生成成功」这一条路径下发 tp_guest，上传参考图、生成失败等路径都不下发，
 * 于是同一个访客的每次请求都会拿到新身份：历史查不到、配额被当成新访客重新计算。
 * 已有 cookie 时原样返回，不覆盖（避免把旧身份的生成记录割裂）。
 */
export function withGuestCookie(
  response: NextResponse,
  request: NextRequest,
  identity: GuestIdentity,
): NextResponse {
  if (request.cookies.has(GUEST_COOKIE)) {
    return response;
  }
  response.cookies.set(GUEST_COOKIE, identity.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
