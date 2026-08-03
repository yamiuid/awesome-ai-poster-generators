import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServerEnv } from "./env";

export const GUEST_COOKIE = "tp_guest";

function digest(value: string): string {
  return createHmac("sha256", getServerEnv().RATE_LIMIT_PEPPER)
    .update(value)
    .digest("hex");
}

export function getGuestIdentity(
  request: NextRequest,
): Readonly<{ cookieValue: string; key: string }> {
  const cookieValue = request.cookies.get(GUEST_COOKIE)?.value ?? randomUUID();
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return {
    cookieValue,
    key: digest(`${cookieValue}:${forwarded}:${userAgent}`),
  };
}

export function getGuestKey(request: NextRequest): string {
  return getGuestIdentity(request).key;
}
