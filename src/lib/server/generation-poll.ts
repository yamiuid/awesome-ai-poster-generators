import { z } from "zod";
import { isVisibleGuestHistory } from "@/lib/domain/generation-history";
import { getTask } from "./apimart";
import { AppError } from "./errors";
import { applyProviderTask, failGeneration } from "./generation-task";
import type { GenerationActor, GenerationRow } from "./generation-types";
import {
  loadConsumedCredits,
  ownsGeneration,
  toGenerationResponse,
} from "./generation-types";
import { createPosterUrl } from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

const POLL_DELAY_MS = 4_000;
const MAX_GENERATION_MS = 15 * 60 * 1_000;
const GUEST_HISTORY_MS = 24 * 60 * 60 * 1_000;
const SIGNED_RECENT_MS = 30 * 60 * 1_000;
const RECENT_LIMIT = 20;
const TERMINAL_STATUSES = [
  "succeeded",
  "partially_succeeded",
  "failed",
  "timed_out",
] as const;
type GenerationPayload = ReturnType<typeof toGenerationResponse>;
type RecentGenerationList = Readonly<{
  active: readonly GenerationPayload[];
  recent: readonly GenerationPayload[];
}>;

const migrationResultSchema = z.object({
  migrated: z.number().int().nonnegative(),
});

function nextPollAt(): string {
  return new Date(Date.now() + POLL_DELAY_MS).toISOString();
}

async function readGeneration(generationId: string): Promise<GenerationRow> {
  const { data, error } = await createSupabaseAdminClient()
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (error) {
    throw new AppError(
      "GENERATION_READ_FAILED",
      "We could not read that generation.",
      503,
    );
  }
  if (!data) {
    throw new AppError(
      "GENERATION_NOT_FOUND",
      "That generation is not available.",
      404,
    );
  }
  return data;
}

async function migrateLegacyGuestIdentity(
  actor: GenerationActor,
): Promise<void> {
  if (actor.mode !== "guest" || actor.guestKey === actor.legacyGuestKey) {
    return;
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "migrate_legacy_guest_generations",
    {
      p_legacy_key: actor.legacyGuestKey,
      p_stable_key: actor.guestKey,
    },
  );
  if (error || !migrationResultSchema.safeParse(data).success) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not restore your previous generations.",
      503,
    );
  }
}

async function loadGeneration(
  generationId: string,
  actor: GenerationActor,
): Promise<GenerationRow> {
  await migrateLegacyGuestIdentity(actor);
  const generation = await readGeneration(generationId);
  if (!ownsGeneration(generation, actor)) {
    throw new AppError(
      "GENERATION_NOT_FOUND",
      "That generation is not available.",
      404,
    );
  }
  return generation;
}

async function responseFor(
  generation: GenerationRow,
): Promise<Readonly<ReturnType<typeof toGenerationResponse>>> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: assets, error } = await admin
    .from("generated_assets")
    .select("*")
    .eq("generation_id", generation.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at");
  if (error) {
    throw new AppError(
      "ASSET_READ_FAILED",
      "We could not read the generated images.",
      503,
    );
  }
  const urls = await Promise.all(
    (assets ?? []).map((asset) => createPosterUrl(asset.storage_path)),
  );
  const consumed = await loadConsumedCredits(admin, [generation.id]);
  return toGenerationResponse(
    { generation, assets: assets ?? [] },
    urls,
    consumed,
  );
}

export async function listRecentGenerations(
  actor: GenerationActor,
): Promise<RecentGenerationList> {
  await migrateLegacyGuestIdentity(actor);
  const admin = createSupabaseAdminClient();
  const guestKeys = [actor.guestKey];
  const activeQuery = admin
    .from("generations")
    .select("*")
    .in("status", ["submitted", "processing"])
    .order("created_at", { ascending: false });
  const recentWindow = new Date(
    Date.now() - (actor.mode === "guest" ? GUEST_HISTORY_MS : SIGNED_RECENT_MS),
  ).toISOString();
  const recentStatuses =
    actor.mode === "guest"
      ? (["succeeded", "partially_succeeded"] as const)
      : TERMINAL_STATUSES;
  const recentQuery = admin
    .from("generations")
    .select("*")
    .in("status", [...recentStatuses])
    .gte("created_at", recentWindow)
    .order("created_at", { ascending: false })
    .limit(actor.userId ? 1 : RECENT_LIMIT);
  const [activeResult, recentResult] = actor.userId
    ? await Promise.all([
        activeQuery.eq("user_id", actor.userId),
        recentQuery.eq("user_id", actor.userId),
      ])
    : await Promise.all([
        activeQuery.in("guest_key", guestKeys).is("user_id", null),
        recentQuery.in("guest_key", guestKeys).is("user_id", null),
      ]);
  if (activeResult.error || recentResult.error) {
    throw new AppError(
      "GENERATION_READ_FAILED",
      "We could not read recent generations.",
      503,
    );
  }
  const activeRows = activeResult.data ?? [];
  const recentRows = recentResult.data ?? [];
  const [active, recentRowsWithAssets] = await Promise.all([
    Promise.all(activeRows.map((row) => responseFor(row))),
    Promise.all(recentRows.map((row) => responseFor(row))),
  ]);
  const recent =
    actor.mode === "guest"
      ? recentRowsWithAssets.filter(isVisibleGuestHistory)
      : recentRowsWithAssets;
  return { active, recent };
}

async function advanceGeneration(
  initialGeneration: GenerationRow,
): Promise<GenerationRow> {
  let generation = initialGeneration;
  if (
    ["succeeded", "partially_succeeded", "failed", "timed_out"].includes(
      generation.status,
    )
  ) {
    return generation;
  }
  if (
    generation.next_poll_at &&
    new Date(generation.next_poll_at).getTime() > Date.now()
  ) {
    return generation;
  }
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await createSupabaseAdminClient()
    .from("generations")
    .update({ next_poll_at: nextPollAt() })
    .eq("id", generation.id)
    .lte("next_poll_at", now)
    .select()
    .maybeSingle();
  if (claimError) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not claim this generation for polling.",
      503,
    );
  }
  if (!claimed) {
    return readGeneration(generation.id);
  }
  generation = claimed;
  if (
    Date.now() - new Date(generation.submitted_at).getTime() >
    MAX_GENERATION_MS
  ) {
    return failGeneration(
      generation,
      "This generation took too long and your credits were returned.",
      "timed_out",
    );
  }
  if (!generation.provider_task_id) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "This generation has no provider task.",
      503,
    );
  }
  return applyProviderTask(
    generation,
    await getTask(generation.provider_task_id),
  );
}

// 轻量轮询：只读状态 + 图片 URL，不在请求内做 APIMart/下载/水印/上传等重活
// （重活由 POST /api/generations/:id/advance 和 cron maintenance 负责）
export async function pollGeneration(
  generationId: string,
  actor: GenerationActor,
): Promise<ReturnType<typeof toGenerationResponse>> {
  return responseFor(await loadGeneration(generationId, actor));
}

// 推进任务（重活：查 APIMart + 下载/水印/上传）。幂等：next_poll_at 未到期直接返回。
export async function advanceGenerationById(
  generationId: string,
  actor: GenerationActor,
): Promise<ReturnType<typeof toGenerationResponse>> {
  const generation = await loadGeneration(generationId, actor);
  return responseFor(await advanceGeneration(generation));
}

export async function recoverGeneration(
  generationId: string,
): Promise<GenerationRow> {
  return advanceGeneration(await readGeneration(generationId));
}
