import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type AccountBalance = Readonly<{
  granted: number;
  reserved: number;
  consumed: number;
  available: number;
  periodStart: string;
  periodEnd: string;
  tier: string;
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
 * 当前周期的可用余额：granted − 进行中的预约 − 已消耗。
 * 没有 entitlement_periods（尚未发生任何预约/结算）时返回 null。
 */
export async function getAccountBalance(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AccountBalance | null> {
  const { data: periods } = await client
    .from("entitlement_periods")
    .select("id, period_start, period_end, credits_granted")
    .eq("user_id", userId)
    .order("period_start", { ascending: false })
    .limit(1);
  const period = periods?.[0];
  if (!period) {
    return null;
  }

  const [{ data: reservations }, { data: transactions }, { data: subs }] =
    await Promise.all([
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
      client
        .from("subscriptions")
        .select("tier")
        .eq("user_id", userId)
        .in("status", ["active", "canceling"])
        .order("activated_at", { ascending: false })
        .limit(1),
    ]);

  const reserved = sumAmounts(reservations ?? []);
  const consumed = sumAmounts(transactions ?? []);
  return {
    granted: period.credits_granted,
    reserved,
    consumed,
    available: computeAvailable(period.credits_granted, reserved, consumed),
    periodStart: period.period_start,
    periodEnd: period.period_end,
    tier: subs?.[0]?.tier ?? "",
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
