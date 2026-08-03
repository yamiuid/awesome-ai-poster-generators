import { creditCost, isQuality, isResolution } from "@/lib/domain/credits";
import { getTask, type ProviderTask } from "./apimart";
import { AppError } from "./errors";
import type { GenerationActor, GenerationRow } from "./generation-types";
import { toGenerationResponse } from "./generation-types";
import {
  bakeWatermark,
  createPosterUrl,
  downloadProviderImage,
  uploadPoster,
} from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

const POLL_DELAY_MS = 4_000;
const MAX_GENERATION_MS = 15 * 60 * 1_000;

function nextPollAt(): string {
  return new Date(Date.now() + POLL_DELAY_MS).toISOString();
}

async function loadGeneration(
  generationId: string,
  actor: GenerationActor,
): Promise<GenerationRow> {
  const { data, error } = await createSupabaseAdminClient()
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.user_id !== actor.userId ||
    data.guest_key !== actor.guestKey
  ) {
    throw new AppError(
      "GENERATION_NOT_FOUND",
      "That generation is not available.",
      404,
    );
  }
  return data;
}

async function responseFor(
  generation: GenerationRow,
): Promise<Readonly<ReturnType<typeof toGenerationResponse>>> {
  const admin = createSupabaseAdminClient();
  const { data: assets, error } = await admin
    .from("generated_assets")
    .select("*")
    .eq("generation_id", generation.id)
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
  return toGenerationResponse({ generation, assets: assets ?? [] }, urls);
}

async function failGeneration(
  generation: GenerationRow,
  actor: GenerationActor,
  message: string,
  status: "failed" | "timed_out",
): Promise<GenerationRow> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("generations")
    .update({
      status,
      error_message: message,
      progress: 100,
      completed_at: new Date().toISOString(),
      reserved_credits: 0,
    })
    .eq("id", generation.id);
  if (generation.mode === "pro") {
    await admin.rpc("settle_credits", {
      p_generation_id: generation.id,
      p_successful_images: 0,
      p_cost_per_image: 0,
    });
  } else {
    await admin.rpc("release_guest_generation", {
      p_guest_key: actor.guestKey,
    });
  }
  const { data } = await admin
    .from("generations")
    .select("*")
    .eq("id", generation.id)
    .single();
  if (!data) {
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
    task.result?.images.flatMap((image) => image.url).slice(0, 4) ?? [];
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
  let stored = existingPaths.size;

  for (const [index, sourceUrl] of images.entries()) {
    const path = `${generation.user_id ?? `guest/${generation.guest_key ?? "unknown"}`}/${generation.id}/${index}.png`;
    if (existingPaths.has(path)) {
      continue;
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
    stored += 1;
  }
  return stored;
}

async function finalizeCompleted(
  generation: GenerationRow,
  task: ProviderTask,
): Promise<GenerationRow> {
  const stored = await storeTaskImages(generation, task);
  const isComplete = stored === 4;
  const status = isComplete ? "succeeded" : "partially_succeeded";
  const admin = createSupabaseAdminClient();
  if (
    generation.mode === "pro" &&
    isResolution(generation.resolution) &&
    isQuality(generation.quality)
  ) {
    await admin.rpc("settle_credits", {
      p_generation_id: generation.id,
      p_successful_images: stored,
      p_cost_per_image: creditCost(generation.resolution, generation.quality),
    });
  }
  await admin
    .from("generations")
    .update({
      status,
      progress: 100,
      completed_at: new Date().toISOString(),
      reserved_credits: 0,
    })
    .eq("id", generation.id);
  const { data } = await admin
    .from("generations")
    .select("*")
    .eq("id", generation.id)
    .single();
  if (!data) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not finalize this generation.",
      503,
    );
  }
  return data;
}

async function applyTask(
  generation: GenerationRow,
  actor: GenerationActor,
  task: ProviderTask,
): Promise<GenerationRow> {
  switch (task.status) {
    case "pending":
    case "processing": {
      const { data } = await createSupabaseAdminClient()
        .from("generations")
        .update({
          status: "processing",
          progress: task.progress ?? generation.progress,
          next_poll_at: nextPollAt(),
        })
        .eq("id", generation.id)
        .select()
        .single();
      if (!data) {
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
        actor,
        task.error?.message ??
          "The image provider failed to generate this poster.",
        "failed",
      );
    default:
      return failGeneration(
        generation,
        actor,
        "The provider returned an unsupported task status.",
        "failed",
      );
  }
}

export async function pollGeneration(
  generationId: string,
  actor: GenerationActor,
): Promise<ReturnType<typeof toGenerationResponse>> {
  let generation = await loadGeneration(generationId, actor);
  if (
    ["succeeded", "partially_succeeded", "failed", "timed_out"].includes(
      generation.status,
    )
  ) {
    return responseFor(generation);
  }
  if (
    generation.next_poll_at &&
    new Date(generation.next_poll_at).getTime() > Date.now()
  ) {
    return responseFor(generation);
  }
  if (
    Date.now() - new Date(generation.submitted_at).getTime() >
    MAX_GENERATION_MS
  ) {
    generation = await failGeneration(
      generation,
      actor,
      "This generation took too long and your credits were returned.",
      "timed_out",
    );
    return responseFor(generation);
  }
  if (!generation.provider_task_id) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "This generation has no provider task.",
      503,
    );
  }
  try {
    generation = await applyTask(
      generation,
      actor,
      await getTask(generation.provider_task_id),
    );
  } catch (error) {
    generation = await failGeneration(
      generation,
      actor,
      error instanceof Error
        ? error.message
        : "The image provider failed to complete this poster.",
      "failed",
    );
  }
  return responseFor(generation);
}
