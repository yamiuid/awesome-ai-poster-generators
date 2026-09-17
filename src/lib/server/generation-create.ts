import { z } from "zod";
import { batchCreditCost } from "@/lib/domain/credits";
import {
  type GenerationRequest,
  normalizeReferenceImages,
  type ProviderQuality,
  referenceImageLimit,
} from "@/lib/domain/poster";
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
  if (actor.mode === "guest") {
    return {
      ...providerBase,
      resolution: "1k",
      quality: "low" as ProviderQuality,
      imageCount: 1,
    };
  }
  if (actor.mode === "free") {
    // 免费档位：1K + low/medium。UI 已锁定，这里兜底防止直接调 API 绕过，
    // 超出部分静默降级，积分按降级后的实际档位扣减。
    const quality: ProviderQuality =
      request.quality === "high" ||
      request.quality === "xhigh" ||
      request.quality === "max"
        ? "medium"
        : request.quality;
    return {
      ...providerBase,
      resolution: "1k",
      quality,
      imageCount: request.imageCount,
    };
  }
  // pro 订阅用户按用户选择的档位生成，费用由积分承担。
  return { ...providerBase, imageCount: request.imageCount };
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
  // 参考图（图生图）：每张在文生图基础价上加 1 积分，与档位无关
  const referenceImages = normalizeReferenceImages(request);
  // 参考图额度按档位限制：访客 1 / 免费 2 / 订阅 5。
  // 前端已按档位拦截，这里兜底防止直接调 API 绕过。
  const referenceLimit = referenceImageLimit(actor.mode);
  if (referenceImages.length > referenceLimit) {
    throw new AppError(
      actor.mode === "guest"
        ? "GUEST_REFERENCE_LIMIT_REACHED"
        : "REFERENCE_LIMIT_REACHED",
      actor.mode === "guest"
        ? "Guests can attach one reference image. Create a free account to attach two."
        : "Free accounts can attach two reference images. Subscribe to attach up to five.",
      402,
    );
  }
  // 积分按实际生成档位（free 模式可能被降级）计算
  const credits =
    actor.mode === "guest"
      ? 0
      : batchCreditCost(
          providerInput.resolution,
          providerInput.quality,
          providerInput.imageCount,
          referenceImages.length,
        );
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
      p_reference_count: referenceImages.length,
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
      // free 模式已无每日配额，quota_exhausted 只会发生在 guest 终身 2 次用完时。
      throw new AppError(
        actor.mode === "guest" ? "GUEST_LIMIT_REACHED" : "INSUFFICIENT_CREDITS",
        actor.mode === "guest"
          ? "You have used your 2 free guest generations. Sign in or create an account to claim 20 welcome credits."
          : "You do not have enough credits for this generation.",
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
        reference_count: referenceImages.length,
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
      await failLimitedGeneration(
        inserted.id,
        "failed",
        "Not enough credits.",
        "INSUFFICIENT_CREDITS",
      );
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

  // 参考图 URL 落库后才能跨设备带回（RPC 只记录张数），
  // 与 input_type 一样属于补写：失败只影响「再次編輯」能否带回参考图
  if (referenceImages.length > 0) {
    const { error: referenceUrlError } = await admin
      .from("generations")
      .update({ reference_urls: referenceImages })
      .eq("id", inserted.id);
    if (referenceUrlError) {
      console.error(
        "Could not store reference image URLs:",
        referenceUrlError.message,
      );
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
        hasReferenceImage: referenceImages.length > 0,
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
    // 提交阶段的失败原因同样要归因：本地安全审查、provider 拒绝、网络错误
    // 在后台需要能分开统计，否则只能靠翻日志。
    await failLimitedGeneration(
      inserted.id,
      "failed",
      message,
      error instanceof AppError ? error.code : "PROVIDER_SUBMIT_FAILED",
    );
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
