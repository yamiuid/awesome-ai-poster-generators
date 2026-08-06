import { z } from "zod";
import { AppError } from "./errors";
import { createSupabaseServerClient } from "./supabase/server";

export type AuthContext = Readonly<{
  userId: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPro: boolean;
}>;

export async function getAuthContext(): Promise<AuthContext> {
  let client: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    client = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { userId: null, email: null, avatarUrl: null, isPro: false };
    }
    throw error;
  }
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) {
    return { userId: null, email: null, avatarUrl: null, isPro: false };
  }

  const { data: subscription, error } = await client
    .from("subscriptions")
    .select("status, period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new AppError(
      "SUBSCRIPTION_READ_FAILED",
      "We could not read your subscription.",
      503,
    );
  }

  const isPro = Boolean(
    subscription &&
      (subscription.status === "active" ||
        subscription.status === "canceling") &&
      new Date(subscription.period_end).getTime() > Date.now(),
  );
  const rawAvatar = user.user_metadata?.["avatar_url"];
  return {
    userId: user.id,
    email: user.email ?? null,
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
    isPro,
  };
}

export async function requireUser(): Promise<
  Readonly<{ userId: string; email: string | null }>
> {
  const context = await getAuthContext();
  if (!context.userId) {
    throw new AppError("AUTH_REQUIRED", "Please sign in to continue.", 401);
  }
  return { userId: context.userId, email: context.email };
}
