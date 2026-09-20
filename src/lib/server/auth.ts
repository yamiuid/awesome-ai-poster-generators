import { z } from "zod";
import { AppError } from "./errors";
import { createSupabaseServerClient } from "./supabase/server";
import {
  lifecycleState,
  type SubscriptionLifecycleState,
} from "./waffo-subscription";

export type SubscriptionTier = "creator" | "studio" | "scale";

export type AuthContext = Readonly<{
  userId: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  /** 用户是否购买过积分包（credit_grants.source = 'credit_pack'） */
  hasPack: boolean;
  tier: SubscriptionTier | null;
  subscriptionState: SubscriptionLifecycleState;
}>;

type VerifiedIdentity = Readonly<{
  userId: string;
  email: string | null;
  avatarUrl: string | null;
}>;

/**
 * 校验登录态。
 *
 * 项目用的是 ES256 非对称签名密钥，`getClaims()` 会用本地缓存的 JWKS 直接验签，
 * 不再像 `getUser()` 那样每次都请求 Auth 服务器（省一跳，约 100–300ms）。
 * 冷启动首次仍需拉一次 JWKS，之后走实例内缓存。
 *
 * 如果 JWKS 拉取/验签出现非「未登录」类异常，退回 `getUser()` 兜底：
 * 不能因为一次网络抖动就把已登录用户当成访客。
 */
async function readVerifiedIdentity(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<VerifiedIdentity | null> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (typeof claims?.sub === "string" && claims.sub.length > 0) {
    const rawAvatar = claims.user_metadata?.["avatar_url"];
    return {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
    };
  }
  // 没有会话就是访客，不需要再问一次 Auth 服务器
  if (!error || error.name === "AuthSessionMissingError") {
    return null;
  }
  console.error("getClaims failed, falling back to getUser", {
    error: error.name,
  });
  const { data: userData } = await client.auth.getUser();
  const user = userData.user;
  if (!user) {
    return null;
  }
  const rawAvatar = user.user_metadata?.["avatar_url"];
  return {
    userId: user.id,
    email: user.email ?? null,
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
  };
}

export async function getAuthContext(): Promise<AuthContext> {
  let client: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    client = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        userId: null,
        email: null,
        avatarUrl: null,
        isPro: false,
        hasPack: false,
        tier: null,
        subscriptionState: "none",
      };
    }
    throw error;
  }
  const identity = await readVerifiedIdentity(client);
  if (!identity) {
    return {
      userId: null,
      email: null,
      avatarUrl: null,
      isPro: false,
      hasPack: false,
      tier: null,
      subscriptionState: "none",
    };
  }

  // 订阅与积分包两查互不依赖，并行发以少一次往返（每个页面渲染都要走这段）
  const [subscriptionResult, packResult] = await Promise.all([
    client
      .from("subscriptions")
      .select("status, period_end, tier")
      .eq("user_id", identity.userId)
      .maybeSingle(),
    // 积分包购买记录：有则解锁全档位 / 无水印 / 180 天保留（按 pro 模式生成）
    client
      .from("credit_grants")
      .select("id")
      .eq("user_id", identity.userId)
      .eq("source", "credit_pack")
      .limit(1),
  ]);
  const { data: subscription, error } = subscriptionResult;
  if (error) {
    throw new AppError(
      "SUBSCRIPTION_READ_FAILED",
      "We could not read your subscription.",
      503,
    );
  }
  const packGrant = packResult.data;

  const subscriptionState = lifecycleState(
    subscription
      ? { status: subscription.status, periodEnd: subscription.period_end }
      : null,
  );
  const isPro =
    subscriptionState === "active" || subscriptionState === "canceling";
  return {
    userId: identity.userId,
    email: identity.email,
    avatarUrl: identity.avatarUrl,
    isPro,
    hasPack: (packGrant?.length ?? 0) > 0,
    tier: isPro ? (subscription?.tier ?? null) : null,
    subscriptionState,
  };
}

export async function requireUser(): Promise<
  Readonly<{
    userId: string;
    email: string | null;
    isPro: boolean;
    hasPack: boolean;
    subscriptionState: SubscriptionLifecycleState;
  }>
> {
  const context = await getAuthContext();
  if (!context.userId) {
    throw new AppError("AUTH_REQUIRED", "Please sign in to continue.", 401);
  }
  return {
    userId: context.userId,
    email: context.email,
    isPro: context.isPro,
    hasPack: context.hasPack,
    subscriptionState: context.subscriptionState,
  };
}
