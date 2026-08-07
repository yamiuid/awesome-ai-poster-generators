import { batchCreditCost } from "@/lib/domain/credits";
import type { GenerationRequest, ProviderQuality } from "@/lib/domain/poster";
import { buildPosterPrompt } from "@/lib/domain/prompts";
import { type ProviderGenerationRequest, submitGeneration } from "./apimart";
import { AppError } from "./errors";
import {
  releaseGuestGeneration,
  settleGenerationCredits,
} from "./generation-settlement";
import type { GenerationActor, GenerationRow } from "./generation-types";
import { getGuestIdentity } from "./guest";
import { createSupabaseAdminClient } from "./supabase/admin";

export function getActorForRequest(
  userId: string | null,
  request: Parameters<typeof getGuestIdentity>[0],
  isPro: boolean,
): GenerationActor {
  return {
    userId,
    guestKey: getGuestIdentity(request).key,
    mode: userId ? (isPro ? "pro" : "free") : "guest",
  };
}

function providerRequest(
  request: GenerationRequest,
  actor: GenerationActor,
): ProviderGenerationRequest {
  const quality: ProviderQuality =
    actor.mode === "pro" ? request.quality : "low";
  return {
    ...request,
    resolution: actor.mode === "pro" ? request.resolution : "1k",
    quality,
    // 免费用户（guest/free）最多 2 张，Pro 可用 1-4 张
    imageCount:
      actor.mode === "pro"
        ? request.imageCount
        : request.imageCount > 2
          ? 2
          : request.imageCount,
  };
}

export async function createGeneration(
  actor: GenerationActor,
  request: GenerationRequest,
): Promise<GenerationRow> {
  const admin = createSupabaseAdminClient();
  const providerInput = providerRequest(request, actor);
  const credits =
    actor.mode === "pro"
      ? batchCreditCost(
          request.resolution,
          request.quality,
          request.aspectRatio,
          providerInput.imageCount,
        )
      : 0;
  const guestClaim = actor.mode !== "pro";

  // 免费用户同时只能一个生成任务（Pro 可并发）
  if (guestClaim) {
    const { data: active, error: activeError } = await admin
      .from("generations")
      .select("id")
      .eq(
        actor.userId ? "user_id" : "guest_key",
        actor.userId ?? actor.guestKey,
      )
      .in("status", ["submitted", "processing"])
      .limit(1);
    if (activeError) {
      throw new AppError(
        "GENERATION_BUSY_UNAVAILABLE",
        "We could not check your active generations.",
        503,
      );
    }
    if (active && active.length > 0) {
      throw new AppError(
        "GENERATION_IN_PROGRESS",
        "Finish your current generation before starting another one.",
        429,
      );
    }
  }

  if (guestClaim) {
    const { data, error } = await admin.rpc("claim_guest_generation", {
      p_guest_key: actor.guestKey,
    });
    if (error) {
      throw new AppError(
        "RATE_LIMIT_UNAVAILABLE",
        "We could not check your free generation limit.",
        503,
      );
    }
    if (!data) {
      throw new AppError(
        "GUEST_LIMIT_REACHED",
        "Your free generation is ready again tomorrow.",
        429,
      );
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from("generations")
    .insert({
      user_id: actor.userId,
      guest_key: actor.guestKey,
      prompt: request.prompt,
      style: request.style,
      aspect_ratio: request.aspectRatio,
      resolution: providerInput.resolution,
      quality: providerInput.quality,
      image_count: providerInput.imageCount,
      mode: actor.mode,
      status: "submitted",
      progress: 0,
      reserved_credits: credits,
      next_poll_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError || !inserted) {
    if (guestClaim) {
      await releaseGuestGeneration(actor.guestKey);
    }
    throw new AppError(
      "GENERATION_CREATE_FAILED",
      "We could not start this generation.",
      500,
    );
  }

  if (credits > 0 && actor.userId) {
    const { data: reserved, error: reserveError } = await admin.rpc(
      "reserve_credits",
      {
        p_user_id: actor.userId,
        p_generation_id: inserted.id,
        p_amount: credits,
      },
    );
    if (reserveError || !reserved) {
      await admin
        .from("generations")
        .update({
          status: "failed",
          reserved_credits: 0,
          completed_at: new Date().toISOString(),
          error_message: "Not enough credits.",
        })
        .eq("id", inserted.id);
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "You do not have enough credits for this generation.",
        402,
      );
    }
  }

  try {
    const provider = await submitGeneration(
      providerInput,
      buildPosterPrompt(request),
    );
    const { data: updated, error: updateError } = await admin
      .from("generations")
      .update({
        provider_task_id: provider.taskId,
        status: "processing",
        next_poll_at: new Date().toISOString(),
      })
      .eq("id", inserted.id)
      .select()
      .single();
    if (updateError || !updated) {
      throw new AppError(
        "GENERATION_STATE_FAILED",
        "We could not save the generation state.",
        500,
      );
    }
    return updated;
  } catch (error) {
    if (credits > 0) {
      await settleGenerationCredits(inserted.id, 0, 0);
    }
    if (guestClaim) {
      await releaseGuestGeneration(actor.guestKey);
    }
    const { error: failureWriteError } = await admin
      .from("generations")
      .update({
        status: "failed",
        reserved_credits: 0,
        completed_at: new Date().toISOString(),
        error_message:
          error instanceof Error ? error.message : "Provider error",
      })
      .eq("id", inserted.id);
    if (failureWriteError) {
      throw new AppError(
        "GENERATION_STATE_FAILED",
        "We could not save the generation failure.",
        503,
      );
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "The image service is temporarily unavailable.",
      503,
    );
  }
}
