import { z } from "zod";
import { batchCreditCost } from "@/lib/domain/credits";
import type { GenerationRequest, ProviderQuality } from "@/lib/domain/poster";
import { buildPosterPrompt } from "@/lib/domain/prompts";
import { type ProviderGenerationRequest, submitGeneration } from "./apimart";
import { AppError } from "./errors";
import {
  failLimitedGeneration,
  settleGenerationCredits,
} from "./generation-settlement";
import type { GenerationActor, GenerationRow } from "./generation-types";
import type { GuestIdentity } from "./guest";
import { detectPosterLanguage } from "./prompt-language";
import { enforcePromptSafety } from "./prompt-safety";
import { createSupabaseAdminClient } from "./supabase/admin";

const limitedGenerationResultSchema = z.object({
  outcome: z.enum(["created", "busy", "quota_exhausted"]),
  generationId: z.string().uuid().optional(),
});

export function getActorForRequest(
  userId: string | null,
  identity: GuestIdentity,
  isPro: boolean,
): GenerationActor {
  return {
    userId,
    guestKey: identity.key,
    guestLimitKey: identity.limitKey,
    legacyGuestKey: identity.legacyKey,
    mode: userId ? (isPro ? "pro" : "free") : "guest",
  };
}

function providerRequest(
  request: GenerationRequest,
  actor: GenerationActor,
): ProviderGenerationRequest {
  const { siteLocale: _siteLocale, ...providerBase } = request;
  const quality: ProviderQuality =
    actor.mode === "pro" ? request.quality : "low";
  return {
    ...providerBase,
    resolution: actor.mode === "pro" ? request.resolution : "1k",
    quality,
    imageCount:
      actor.mode === "pro"
        ? request.imageCount
        : actor.mode === "guest"
          ? 1
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
  if (actor.mode === "guest" && request.imageCount !== 1) {
    throw new AppError(
      "GUEST_IMAGE_COUNT_LIMIT",
      "Guest generations create one poster at a time.",
      400,
    );
  }
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

  let inserted: GenerationRow;
  if (guestClaim) {
    const { data, error } = await admin.rpc("create_limited_generation", {
      p_user_id: actor.userId,
      p_guest_key: actor.userId ? null : actor.guestKey,
      p_legacy_guest_key: actor.userId ? null : actor.legacyGuestKey,
      p_guest_limit_key: actor.userId ? null : actor.guestLimitKey,
      p_prompt: request.prompt,
      p_style: request.style,
      p_aspect_ratio: request.aspectRatio,
      p_resolution: providerInput.resolution,
      p_quality: providerInput.quality,
      p_image_count: providerInput.imageCount,
      p_mode: actor.mode,
      p_reserved_credits: credits,
    });
    if (error) {
      throw new AppError(
        "GENERATION_CREATE_UNAVAILABLE",
        "We could not start this generation right now.",
        503,
      );
    }
    const parsed = limitedGenerationResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new AppError(
        "GENERATION_CREATE_UNAVAILABLE",
        "The generation service returned an invalid response.",
        503,
      );
    }
    if (parsed.data.outcome === "busy") {
      throw new AppError(
        "GENERATION_IN_PROGRESS",
        "Finish your current generation before starting another one.",
        429,
      );
    }
    if (parsed.data.outcome === "quota_exhausted") {
      throw new AppError(
        actor.mode === "guest"
          ? "GUEST_LIMIT_REACHED"
          : "FREE_DAILY_LIMIT_REACHED",
        actor.mode === "guest"
          ? "You have used your 1 free generation for today. Sign in or create an account for 4 free poster images each day."
          : "You have used all 4 free poster images for today. Upgrade to Pro or come back tomorrow.",
        429,
      );
    }
    if (!parsed.data.generationId) {
      throw new AppError(
        "GENERATION_CREATE_UNAVAILABLE",
        "The generation service did not return a task ID.",
        503,
      );
    }
    const { data: row, error: readError } = await admin
      .from("generations")
      .select()
      .eq("id", parsed.data.generationId)
      .single();
    if (readError || !row) {
      await failLimitedGeneration(
        parsed.data.generationId,
        "failed",
        "The new generation could not be read.",
      );
      throw new AppError(
        "GENERATION_CREATE_FAILED",
        "We could not read the new generation.",
        500,
      );
    }
    inserted = row;
  } else {
    const { data: row, error: insertError } = await admin
      .from("generations")
      .insert({
        user_id: actor.userId,
        guest_key: null,
        guest_limit_key: null,
        guest_claimed_at: null,
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
    if (insertError || !row) {
      throw new AppError(
        "GENERATION_CREATE_FAILED",
        "We could not start this generation.",
        500,
      );
    }
    inserted = row;
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
      await failLimitedGeneration(inserted.id, "failed", "Not enough credits.");
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "You do not have enough credits for this generation.",
        402,
      );
    }
  }

  if (request.inputType) {
    const { error: inputTypeError } = await admin
      .from("generations")
      .update({ input_type: request.inputType })
      .eq("id", inserted.id);
    if (inputTypeError) {
      // 输入类型仅用于分析，写入失败不阻断生成
    }
  }

  try {
    await enforcePromptSafety(request.prompt);
    const textLanguage = await detectPosterLanguage(
      request.prompt,
      request.siteLocale,
    );
    const provider = await submitGeneration(
      providerInput,
      buildPosterPrompt(request, {
        hasReferenceImage: Boolean(request.referenceImageUrl),
        textLanguage,
      }),
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
    const message = error instanceof Error ? error.message : "Provider error";
    await failLimitedGeneration(inserted.id, "failed", message);
    if (credits > 0) {
      await settleGenerationCredits(inserted.id, 0, 0);
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
