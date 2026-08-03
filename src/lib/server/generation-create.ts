import { batchCreditCost } from "@/lib/domain/credits";
import type { GenerationRequest, ProviderQuality } from "@/lib/domain/poster";
import { buildPosterPrompt } from "@/lib/domain/prompts";
import { type ProviderGenerationRequest, submitGeneration } from "./apimart";
import { AppError } from "./errors";
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
      ? batchCreditCost(request.resolution, request.quality)
      : 0;
  const guestClaim = actor.mode !== "pro";

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
      await admin.rpc("release_guest_generation", {
        p_guest_key: actor.guestKey,
      });
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
    await admin
      .from("generations")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message : "Provider error",
      })
      .eq("id", inserted.id);
    if (credits > 0) {
      await admin.rpc("settle_credits", {
        p_generation_id: inserted.id,
        p_successful_images: 0,
        p_cost_per_image: 0,
      });
    }
    if (guestClaim) {
      await admin.rpc("release_guest_generation", {
        p_guest_key: actor.guestKey,
      });
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
