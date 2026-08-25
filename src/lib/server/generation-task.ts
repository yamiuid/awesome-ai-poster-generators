import {
  creditCost,
  isAspectRatio,
  isQuality,
  isResolution,
} from "@/lib/domain/credits";
import {
  FINALIZING_PROGRESS,
  monotonicWorkingProgress,
  PROVIDER_PROGRESS_CEILING,
} from "@/lib/domain/generation-progress";
import type { ProviderTask } from "./apimart";
import { AppError } from "./errors";
import {
  failLimitedGeneration,
  settleGenerationCredits,
} from "./generation-settlement";
import type { GenerationRow } from "./generation-types";
import { bakeWatermark, downloadProviderImage, uploadPoster } from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

const POLL_DELAY_MS = 4_000;

function nextPollAt(): string {
  return new Date(Date.now() + POLL_DELAY_MS).toISOString();
}

export async function failGeneration(
  generation: GenerationRow,
  message: string,
  status: "failed" | "timed_out",
): Promise<GenerationRow> {
  const updated = await failLimitedGeneration(generation.id, status, message);
  if (generation.mode === "pro" && updated) {
    await settleGenerationCredits(generation.id, 0, 0);
  }
  const { data, error } = await createSupabaseAdminClient()
    .from("generations")
    .select()
    .eq("id", generation.id)
    .single();
  if (error || !data) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not save the generation failure.",
      503,
    );
  }
  return data;
}

async function storeTaskImages(
  generation: GenerationRow,
  task: ProviderTask,
): Promise<number> {
  const images =
    task.result?.images
      .flatMap((image) => image.url)
      .slice(0, generation.image_count) ?? [];
  if (images.length === 0) {
    throw new AppError(
      "NO_IMAGES",
      "The provider completed without returning images.",
      502,
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("generated_assets")
    .select("storage_path")
    .eq("generation_id", generation.id);
  const existingPaths = new Set(
    (existing ?? []).map((asset) => asset.storage_path),
  );

  // 并发下载/水印/上传，避免串行调外部 API 超时
  const tasks = images.map(async (sourceUrl, index) => {
    const path = `${generation.user_id ?? `guest/${generation.guest_key ?? "unknown"}`}/${generation.id}/${index}.png`;
    if (existingPaths.has(path)) {
      return false;
    }
    const downloaded = await downloadProviderImage(sourceUrl);
    const image =
      generation.mode === "pro" ? downloaded : await bakeWatermark(downloaded);
    await uploadPoster(path, image);
    const { error } = await admin.from("generated_assets").insert({
      generation_id: generation.id,
      user_id: generation.user_id,
      guest_key: generation.guest_key,
      storage_path: path,
      alt_text: generation.prompt,
      watermarked: generation.mode !== "pro",
      expires_at:
        generation.mode === "pro"
          ? null
          : new Date(
              Date.now() + (generation.user_id ? 7 : 1) * 24 * 60 * 60 * 1_000,
            ).toISOString(),
    });
    if (error) {
      throw new AppError(
        "ASSET_RECORD_FAILED",
        "The generated image could not be recorded.",
        503,
      );
    }
    return true;
  });
  const results = await Promise.allSettled(tasks);
  let stored = existingPaths.size;
  let firstFailure: unknown = null;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      stored += 1;
    } else if (result.status === "rejected" && firstFailure === null) {
      firstFailure = result.reason;
    }
  }
  if (firstFailure !== null) {
    throw firstFailure;
  }
  return stored;
}

async function finalizeCompleted(
  generation: GenerationRow,
  task: ProviderTask,
): Promise<GenerationRow> {
  const admin = createSupabaseAdminClient();
  const { data: finalizing, error: finalizingError } = await admin
    .from("generations")
    .update({
      status: "processing",
      progress: Math.max(generation.progress, FINALIZING_PROGRESS),
      error_code: null,
      error_message: null,
    })
    .eq("id", generation.id)
    .select()
    .single();
  if (finalizingError || !finalizing) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not begin preparing the generated files.",
      503,
    );
  }

  const stored = await storeTaskImages(finalizing, task);
  const status =
    stored >= generation.image_count ? "succeeded" : "partially_succeeded";
  if (
    generation.mode === "pro" &&
    isResolution(generation.resolution) &&
    isQuality(generation.quality) &&
    isAspectRatio(generation.aspect_ratio)
  ) {
    await settleGenerationCredits(
      generation.id,
      stored,
      creditCost(
        generation.resolution,
        generation.quality,
        generation.aspect_ratio,
      ),
    );
  }
  const { data, error } = await admin
    .from("generations")
    .update({
      status,
      progress: 100,
      completed_at: new Date().toISOString(),
      reserved_credits: 0,
      error_code: null,
      error_message: null,
    })
    .eq("id", generation.id)
    .select()
    .single();
  if (error || !data) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not finalize this generation.",
      503,
    );
  }
  return data;
}

export async function applyProviderTask(
  generation: GenerationRow,
  task: ProviderTask,
): Promise<GenerationRow> {
  switch (task.status) {
    case "pending":
    case "processing": {
      const { data, error } = await createSupabaseAdminClient()
        .from("generations")
        .update({
          status: "processing",
          progress: monotonicWorkingProgress(
            generation.progress,
            task.progress,
            PROVIDER_PROGRESS_CEILING,
          ),
          error_code: null,
          error_message: null,
          next_poll_at: nextPollAt(),
        })
        .eq("id", generation.id)
        .select()
        .single();
      if (error || !data) {
        throw new AppError(
          "GENERATION_STATE_FAILED",
          "We could not update generation progress.",
          503,
        );
      }
      return data;
    }
    case "completed":
      return finalizeCompleted(generation, task);
    case "failed":
    case "cancelled":
      return failGeneration(
        generation,
        task.error?.message ??
          "The image provider failed to generate this poster.",
        "failed",
      );
    default:
      return failGeneration(
        generation,
        "The provider returned an unsupported task status.",
        "failed",
      );
  }
}
