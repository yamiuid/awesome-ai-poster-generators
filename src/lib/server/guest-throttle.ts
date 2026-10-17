import { createHmac } from "node:crypto";
import { getServerEnv } from "./env";
import { AppError } from "./errors";
import { clientIpFromRequest } from "./rate-limit";
import { createSupabaseAdminClient } from "./supabase/admin";

type GuestAction = "generation" | "upload";

async function isGuestRateLimited(
  request: Request,
  action: GuestAction,
): Promise<boolean> {
  const ip = clientIpFromRequest(request);
  if (ip === "local" && process.env.NODE_ENV === "production") {
    throw new AppError(
      "CLIENT_IP_UNAVAILABLE",
      "We could not determine your network address. Please try again later.",
      503,
    );
  }

  const ipHash = createHmac("sha256", getServerEnv().RATE_LIMIT_PEPPER)
    .update(ip)
    .digest("hex");
  const { data, error } = await createSupabaseAdminClient().rpc(
    "consume_guest_ip_rate_limit",
    { p_ip_hash: ipHash, p_action: action },
  );
  if (error || typeof data !== "boolean") {
    console.error("Guest IP rate limit check failed", error?.message);
    throw new AppError(
      "GUEST_RATE_LIMIT_UNAVAILABLE",
      "Guest requests are temporarily unavailable. Please try again later.",
      503,
    );
  }
  return !data;
}

export function isGuestGenerationRateLimited(
  request: Request,
): Promise<boolean> {
  return isGuestRateLimited(request, "generation");
}

export function isGuestUploadRateLimited(request: Request): Promise<boolean> {
  return isGuestRateLimited(request, "upload");
}
