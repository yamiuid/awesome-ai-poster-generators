import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type AccountBalance = Readonly<{
  granted: number;
  reserved: number;
  consumed: number;
  available: number;
  /** subscription = 订阅月度窗口；permanent = welcome/积分包的永久余额 */
  bucket: "subscription" | "permanent";
  /** 永久桶无周期概念，返回 null */
  periodStart: string | null;
  periodEnd: string | null;
  tier: string;
  /** 订阅档位，含已经结束的订阅（账户页文案要用），没订阅过为 null */
  planTier: string | null;
  /** 上个订阅周期没花完、但已经用不了的点数 */
  expired: Readonly<{
    tier: string;
    available: number;
    periodEnd: string;
  }> | null;
  /** 永久桶的赠送明细（welcome / 各笔积分包），订阅桶为空数组 */
  grants: ReadonlyArray<{
    source: string;
    amount: number;
    createdAt: string;
  }>;
}>;

export type CreditTransactionView = Readonly<{
  id: string;
  kind: string;
  amount: number;
  createdAt: string;
  generation: Readonly<{
    id: string;
    prompt: string;
    mode: string;
    resolution: string;
    quality: string;
    aspectRatio: string;
    imageCount: number;
    status: string;
    reservedCredits: number;
  }> | null;
}>;

export function sumAmounts(rows: ReadonlyArray<{ amount: number }>): number {
  return rows.reduce((total, row) => total + row.amount, 0);
}

export function computeAvailable(
  granted: number,
  reserved: number,
  consumed: number,
): number {
  return granted - reserved - consumed;
}

type BalancePeriodRow = Readonly<{
  id: string;
  period_start: string;
  period_end: string;
  credits_granted: number;
  bucket: string;
}>;

type BalanceSubscriptionRow = Readonly<{
  status: string;
  period_end: string;
  tier: string | null;
}>;

export type BalancePeriodSelection = Readonly<{
  /** 计入「可用余额」的周期；订阅已结束时退回永久桶 */
  primary: BalancePeriodRow | null;
  /** 订阅周期里的遗留点数：可以展示，但 reserve_credits 不会再动它们 */
  expired: Readonly<{
    tier: string;
    periodId: string;
    periodEnd: string;
    creditsGranted: number;
  }> | null;
}>;

/**
 * 决定余额该看哪个桶。
 *
 * reserve_credits 只在 `status in (active, canceling) and period_end > now()`
 * 时才从订阅桶扣，否则一律走永久桶——订阅一到期，订阅桶里剩的点数就用不了了。
 * 账户页必须用同一套判断，否则会显示一个「看得见却花不掉」的数字。
 */
export function selectBalancePeriod(
  periods: readonly BalancePeriodRow[],
  subscription: BalanceSubscriptionRow | null,
  now: Date = new Date(),
): BalancePeriodSelection {
  const permanent = periods.find((row) => row.bucket === "permanent") ?? null;
  const subscriptionPeriod =
    periods.find((row) => row.bucket !== "permanent") ?? null;
  const subscriptionActive =
    subscription !== null &&
    (subscription.status === "active" || subscription.status === "canceling") &&
    new Date(subscription.period_end).getTime() > now.getTime();

  if (subscriptionActive) {
    return { primary: subscriptionPeriod ?? permanent, expired: null };
  }
  return {
    primary: permanent,
    expired:
      subscriptionPeriod && subscription?.tier
        ? {
            tier: subscription.tier,
            periodId: subscriptionPeriod.id,
            periodEnd: subscriptionPeriod.period_end,
            creditsGranted: subscriptionPeriod.credits_granted,
          }
        : null,
  };
}

/**
 * 当前可用余额：granted − 进行中的预约 − 已消耗。
 *
 * 双桶模型：
 * - 订阅桶（entitlement_periods.bucket = 'subscription'）：Pro 用户月度窗口，
 *   余额按当前周期计算，周期结束清零。
 * - 永久桶（bucket = 'permanent'）：welcome / 积分包赠送，余额不过期。
 *
 * 有订阅桶时优先返回订阅桶（订阅用户的永久桶积分在订阅结束后可用），
 * 没有任何桶时返回 null。
 */
export async function getAccountBalance(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AccountBalance | null> {
  const [{ data: periods }, { data: subscription }] = await Promise.all([
    client
      .from("entitlement_periods")
      .select("id, period_start, period_end, credits_granted, bucket")
      .eq("user_id", userId)
      .order("period_start", { ascending: false }),
    client
      .from("subscriptions")
      .select("status, period_end, tier")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const rows = periods ?? [];
  if (rows.length === 0) {
    return null;
  }
  const selection = selectBalancePeriod(rows, subscription ?? null);
  const expired = selection.expired;
  const period = selection.primary;
  const planTier = subscription?.tier ?? null;
  if (!period) {
    // 只剩一个已经结束的订阅周期：可用余额是 0（reserve_credits 会懒建永久桶），
    // 但要把那批失效点数如实告诉用户。
    const expiredAvailable = expired
      ? await periodAvailable(
          client,
          userId,
          expired.periodId,
          expired.creditsGranted,
        )
      : 0;
    return {
      granted: 0,
      reserved: 0,
      consumed: 0,
      available: 0,
      bucket: "permanent",
      periodStart: null,
      periodEnd: null,
      tier: "",
      planTier,
      expired: expired
        ? {
            tier: expired.tier,
            available: expiredAvailable,
            periodEnd: expired.periodEnd,
          }
        : null,
      grants: [],
    };
  }
  const isPermanent = period.bucket === "permanent";

  const [
    { data: reservations },
    { data: transactions },
    { data: grants },
  ] = await Promise.all([
    client
      .from("credit_reservations")
      .select("amount")
      .eq("user_id", userId)
      .eq("period_id", period.id)
      .eq("status", "reserved"),
    client
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("period_id", period.id)
      .eq("kind", "consume"),
    isPermanent
      ? client
          .from("credit_grants")
          .select("source, amount, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const reserved = sumAmounts(reservations ?? []);
  const consumed = sumAmounts(transactions ?? []);
  const expiredAvailable = expired
    ? await periodAvailable(
        client,
        userId,
        expired.periodId,
        expired.creditsGranted,
      )
    : 0;
  return {
    granted: period.credits_granted,
    reserved,
    consumed,
    available: computeAvailable(period.credits_granted, reserved, consumed),
    bucket: isPermanent ? "permanent" : "subscription",
    periodStart: isPermanent ? null : period.period_start,
    periodEnd: isPermanent ? null : period.period_end,
    tier: isPermanent ? "" : (planTier ?? ""),
    planTier,
    expired: expired
      ? {
          tier: expired.tier,
          available: expiredAvailable,
          periodEnd: expired.periodEnd,
        }
      : null,
    grants: (grants ?? []).map((grant) => ({
      source: grant.source,
      amount: grant.amount,
      createdAt: grant.created_at,
    })),
  };
}

/** 某个周期还剩多少点数（授予 − 已预约 − 已消耗）。 */
async function periodAvailable(
  client: SupabaseClient<Database>,
  userId: string,
  periodId: string,
  granted: number,
): Promise<number> {
  const [{ data: reservations }, { data: transactions }] = await Promise.all([
    client
      .from("credit_reservations")
      .select("amount")
      .eq("user_id", userId)
      .eq("period_id", periodId)
      .eq("status", "reserved"),
    client
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("period_id", periodId)
      .eq("kind", "consume"),
  ]);
  return computeAvailable(
    granted,
    sumAmounts(reservations ?? []),
    sumAmounts(transactions ?? []),
  );
}

/**
 * 最近 limit 条积分交易（时间倒序），关联生成记录信息。
 */
export async function listAccountTransactions(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<CreditTransactionView[]> {
  const { data: transactions } = await client
    .from("credit_transactions")
    .select("id, kind, amount, generation_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = transactions ?? [];
  const generationIds = rows.flatMap((row) =>
    row.generation_id ? [row.generation_id] : [],
  );
  const { data: generations } =
    generationIds.length > 0
      ? await client
          .from("generations")
          .select(
            "id, prompt, mode, resolution, quality, aspect_ratio, image_count, status, reserved_credits",
          )
          .in("id", generationIds)
      : { data: [] };
  const generationsById = new Map(
    (generations ?? []).map((generation) => [generation.id, generation]),
  );

  return rows.map((row) => {
    const generation = row.generation_id
      ? generationsById.get(row.generation_id)
      : undefined;
    return {
      id: row.id,
      kind: row.kind,
      amount: row.amount,
      createdAt: row.created_at,
      generation: generation
        ? {
            id: generation.id,
            prompt: generation.prompt,
            mode: generation.mode,
            resolution: generation.resolution,
            quality: generation.quality,
            aspectRatio: generation.aspect_ratio,
            imageCount: generation.image_count,
            status: generation.status,
            reservedCredits: generation.reserved_credits,
          }
        : null,
    };
  });
}
