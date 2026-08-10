import { z } from "zod";
import { AppError } from "./errors";
import { createSupabaseServerClient } from "./supabase/server";
import {
  lifecycleState,
  type SubscriptionLifecycleState,
} from "./waffo-subscription";

export type SubscriptionTier = "creator" | "studio";

export type AuthContext = Readonly<{
  userId: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  tier: SubscriptionTier | null;
  subscriptionState: SubscriptionLifecycleState;
}>;

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
        tier: null,
        subscriptionState: "none",
      };
    }
    throw error;
  }
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) {
    return {
      userId: null,
      email: null,
      avatarUrl: null,
      isPro: false,
      tier: null,
      subscriptionState: "none",
    };
  }

  const { data: subscription, error } = await client
    .from("subscriptions")
    .select("status, period_end, tier")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new AppError(
      "SUBSCRIPTION_READ_FAILED",
      "We could not read your subscription.",
      503,
    );
  }

  const subscriptionState = lifecycleState(
    subscription
      ? { status: subscription.status, periodEnd: subscription.period_end }
      : null,
  );
  const isPro =
    subscriptionState === "active" || subscriptionState === "canceling";
  const rawAvatar = user.user_metadata?.["avatar_url"];
  return {
    userId: user.id,
    email: user.email ?? null,
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
    isPro,
    tier: isPro ? (subscription?.tier ?? null) : null,
    subscriptionState,
  };
}

export async function requireUser(): Promise<
  Readonly<{
    userId: string;
    email: string | null;
    isPro: boolean;
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
    subscriptionState: context.subscriptionState,
  };
}
