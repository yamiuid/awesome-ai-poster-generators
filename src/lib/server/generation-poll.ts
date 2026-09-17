import { HTTPError } from "ky";
import { z } from "zod";
import { isVisibleGuestRecent } from "@/lib/domain/generation-history";
import {
  generationFailureStatus,
  serverPollBackoffMs,
} from "@/lib/domain/generation-progress";
import type { GenerationMode } from "@/lib/domain/poster";
import { sendAlert } from "./alerts";
import { getTask } from "./apimart";
import { AppError } from "./errors";
import { applyProviderTask, failGeneration } from "./generation-task";
import type { GenerationActor, GenerationRow } from "./generation-types";
import {
  loadConsumedCredits,
  ownsGeneration,
  toGenerationResponse,
} from "./generation-types";
import { createPosterUrls } from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

const MAX_GENERATION_MS = 15 * 60 * 1_000;
// 12 次退避重试 ≈ 9 分钟（末段每次 60s），仍在 15 分钟硬超时以内。
// 原值 5 配合 4s 固定间隔只有约 50 秒，对方网络抖一下就会把仍在出图的任务判死。
const MAX_POLL_FAILURES = 12;
const PROVIDER_TIMEOUT_MESSAGE =
  "The image service stopped responding and your credits were returned.";
const PROVIDER_TASK_MISSING_MESSAGE =
  "The image service no longer has this generation. Please try again.";
const DAY_MS = 24 * 60 * 60 * 1_000;
/**
 * 首页历史窗口必须覆盖资产保留期（见 generation-task.ts 写入的 expires_at）：
 * 游客 1 天、登录免费用户 7 天、Pro 资产永久不过期。
 * 窗口短于保留期会出现「图片还在存储里、历史里却查不到」。
 */
const GUEST_HISTORY_MS = 1 * DAY_MS;
const FREE_HISTORY_MS = 7 * DAY_MS;
const RECENT_LIMIT = 20;

export function recentHistoryWindow(mode: GenerationMode): string | null {
  if (mode === "pro") {
    // Pro 资产的 expires_at 为 null（永久保留），不限时间窗，只按 RECENT_LIMIT 截断
    return null;
  }
  return new Date(
    Date.now() - (mode === "guest" ? GUEST_HISTORY_MS : FREE_HISTORY_MS),
  ).toISOString();
}
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

export function isRecoverableTimedOutGeneration(
  generation: Pick<
    GenerationRow,
    "status" | "provider_task_id" | "poll_failures" | "error_message"
  >,
): boolean {
  return (
    generation.status === "timed_out" &&
    generation.provider_task_id !== null &&
    generation.poll_failures >= MAX_POLL_FAILURES - 1 &&
    generation.error_message === PROVIDER_TIMEOUT_MESSAGE
  );
}

function nextPollAt(failures = 0): string {
  return new Date(Date.now() + serverPollBackoffMs(failures)).toISOString();
}

/**
 * provider 明确表示任务不存在（400/404，例如任务已过期被清理）：
 * 重试不会有结果，直接定论，不必等轮询次数耗尽。
 */
export function isMissingProviderTaskError(error: unknown): boolean {
  return (
    error instanceof HTTPError &&
    (error.response.status === 400 || error.response.status === 404)
  );
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

async function recoverTimedOutGeneration(
  generation: GenerationRow,
): Promise<GenerationRow> {
  if (
    !isRecoverableTimedOutGeneration(generation) ||
    !generation.provider_task_id
  ) {
    return generation;
  }
  try {
    const task = await getTask(generation.provider_task_id);
    if (
      task.status === "pending" ||
      task.status === "processing" ||
      task.status === "completed"
    ) {
      return applyProviderTask(
        {
          ...generation,
          status: "processing",
          progress: Math.min(generation.progress, 94),
          error_code: null,
          error_message: null,
          next_poll_at: null,
          completed_at: null,
          poll_failures: 0,
        },
        task,
      );
    }
  } catch (error) {
    console.error("Generation timeout recovery failed", {
      generationId: generation.id,
      error: error instanceof Error ? error.message : String(error),
    });
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
  const urls = await createPosterUrls(
    (assets ?? []).map((asset) => asset.storage_path),
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
  const recentWindow = recentHistoryWindow(actor.mode);
  const recentStatuses = TERMINAL_STATUSES;
  const recentBaseQuery = admin
    .from("generations")
    .select("*")
    .in("status", [...recentStatuses])
    .order("created_at", { ascending: false });
  const recentQuery = (
    recentWindow
      ? recentBaseQuery.gte("created_at", recentWindow)
      : recentBaseQuery
  ).limit(RECENT_LIMIT);
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
  const recentRows = await Promise.all(
    (recentResult.data ?? []).map(recoverTimedOutGeneration),
  );
  const [active, recentRowsWithAssets] = await Promise.all([
    Promise.all(activeRows.map((row) => responseFor(row))),
    Promise.all(recentRows.map((row) => responseFor(row))),
  ]);
  const recent =
    actor.mode === "guest"
      ? recentRowsWithAssets.filter(isVisibleGuestRecent)
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
      "GENERATION_TIMEOUT",
    );
  }
  if (!generation.provider_task_id) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "This generation has no provider task.",
      503,
    );
  }
  let task: Awaited<ReturnType<typeof getTask>>;
  try {
    task = await getTask(generation.provider_task_id);
  } catch (error) {
    if (isMissingProviderTaskError(error)) {
      return failGeneration(
        generation,
        PROVIDER_TASK_MISSING_MESSAGE,
        "failed",
        "PROVIDER_TASK_MISSING",
      );
    }
    const failures = (generation.poll_failures ?? 0) + 1;
    const outcome = generationFailureStatus(
      "provider_poll",
      failures,
      MAX_POLL_FAILURES,
    );
    if (outcome === "timed_out") {
      // 这里以前是完全静默的：任务被判超时，但没有任何日志可查
      await sendAlert("generation.poll_exhausted", {
        generationId: generation.id,
        taskId: generation.provider_task_id,
        pollFailures: failures,
        error: error instanceof Error ? error.message : String(error),
      });
      return failGeneration(
        generation,
        PROVIDER_TIMEOUT_MESSAGE,
        "timed_out",
        "PROVIDER_TIMEOUT",
      );
    }
    await createSupabaseAdminClient()
      .from("generations")
      .update({ poll_failures: failures, next_poll_at: nextPollAt(failures) })
      .eq("id", generation.id);
    throw error;
  }

  try {
    const updated = await applyProviderTask(generation, task);
    await createSupabaseAdminClient()
      .from("generations")
      .update({ poll_failures: 0 })
      .eq("id", generation.id);
    return updated;
  } catch (error) {
    const failures = (generation.poll_failures ?? 0) + 1;
    const outcome = generationFailureStatus(
      "finalization",
      failures,
      MAX_POLL_FAILURES,
    );
    console.error("Generation finalization failed", {
      generationId: generation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    if (outcome === "failed") {
      return failGeneration(
        generation,
        "The poster was generated, but we could not save it. Please try again.",
        "failed",
        "FINALIZATION_FAILED",
      );
    }
    await createSupabaseAdminClient()
      .from("generations")
      .update({ poll_failures: failures, next_poll_at: nextPollAt() })
      .eq("id", generation.id);
    return readGeneration(generation.id);
  }
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

// 客户端连续推进失败后主动放弃：先核实 provider 真实状态，避免网络抖动时
// 误杀仍在出图的任务。仅在 provider 已失败/取消，或超过硬超时后标记 timed_out。
export async function giveUpGenerationById(
  generationId: string,
  actor: GenerationActor,
): Promise<ReturnType<typeof toGenerationResponse>> {
  const generation = await loadGeneration(generationId, actor);
  if (
    ["succeeded", "partially_succeeded", "failed", "timed_out"].includes(
      generation.status,
    )
  ) {
    return responseFor(generation);
  }
  const hardTimeoutPassed =
    Date.now() - new Date(generation.submitted_at).getTime() >
    MAX_GENERATION_MS;

  // 有 provider 任务时先核实真实状态
  if (generation.provider_task_id) {
    try {
      const task = await getTask(generation.provider_task_id);
      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        // provider 已有结论：走正常推进落库/标记失败，而不是直接放弃
        return responseFor(await applyProviderTask(generation, task));
      }
    } catch (error) {
      // provider 说任务不存在：重试也不会有结果，直接定论
      if (isMissingProviderTaskError(error)) {
        return responseFor(
          await failGeneration(
            generation,
            PROVIDER_TASK_MISSING_MESSAGE,
            "failed",
            "PROVIDER_TASK_MISSING",
          ),
        );
      }
      // 查不到 provider 状态时保守处理：未到硬超时就不放弃
    }
    if (!hardTimeoutPassed) {
      // provider 仍在处理中：任务继续，返回当前状态让客户端保持轮询
      return responseFor(generation);
    }
  }

  const updated = await failGeneration(
    generation,
    "The image service did not respond; your credits were returned.",
    "timed_out",
    "PROVIDER_UNRESPONSIVE",
  );
  return responseFor(updated);
}

export async function recoverGeneration(
  generationId: string,
): Promise<GenerationRow> {
  return advanceGeneration(await readGeneration(generationId));
}
