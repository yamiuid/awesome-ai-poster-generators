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
  const { data: periods } = await client
    .from("entitlement_periods")
    .select("id, period_start, period_end, credits_granted, bucket")
    .eq("user_id", userId)
    .order("period_start", { ascending: false });
  const rows = periods ?? [];
  const permanentPeriod = rows.find((row) => row.bucket === "permanent");
  const subscriptionPeriod = rows.find((row) => row.bucket !== "permanent");
  const period = subscriptionPeriod ?? permanentPeriod;
  if (!period) {
    return null;
  }
  const isPermanent = period.bucket === "permanent";

  const [
    { data: reservations },
    { data: transactions },
    { data: subs },
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
      ? Promise.resolve({ data: [] })
      : client
          .from("subscriptions")
          .select("tier")
          .eq("user_id", userId)
          .in("status", ["active", "canceling"])
          .order("activated_at", { ascending: false })
          .limit(1),
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
  return {
    granted: period.credits_granted,
    reserved,
    consumed,
    available: computeAvailable(period.credits_granted, reserved, consumed),
    bucket: isPermanent ? "permanent" : "subscription",
    periodStart: isPermanent ? null : period.period_start,
    periodEnd: isPermanent ? null : period.period_end,
    tier: isPermanent ? "" : (subs?.[0]?.tier ?? ""),
    grants: (grants ?? []).map((grant) => ({
      source: grant.source,
      amount: grant.amount,
      createdAt: grant.created_at,
    })),
  };
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
