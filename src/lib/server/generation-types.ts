import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AspectRatio,
  GenerationAcceptedResponse,
  GenerationMode,
  GenerationResponse,
  GenerationStatus,
} from "@/lib/domain/poster";
import type { Database } from "./supabase/types";

export type GenerationActor = Readonly<{
  userId: string | null;
  guestKey: string;
  guestLimitKey: string;
  legacyGuestKey: string;
  mode: GenerationMode;
}>;

export type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];
export type AssetRow = Database["public"]["Tables"]["generated_assets"]["Row"];

export type GenerationWithAssets = Readonly<{
  generation: GenerationRow;
  assets: readonly AssetRow[];
}>;

/**
 * 查询一批生成已实际结算（consume）的积分，按 generation_id 求和。
 * 部分成功时 consume 行金额小于 reserved，差值即"节省"的积分。
 */
export async function loadConsumedCredits(
  admin: SupabaseClient<Database>,
  generationIds: readonly string[],
): Promise<Readonly<Record<string, number>>> {
  if (generationIds.length === 0) {
    return {};
  }
  const { data, error } = await admin
    .from("credit_transactions")
    .select("generation_id, amount")
    .in("generation_id", generationIds)
    .eq("kind", "consume");
  if (error) {
    return {};
  }
  const consumed: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.generation_id) {
      continue;
    }
    consumed[row.generation_id] =
      (consumed[row.generation_id] ?? 0) + row.amount;
  }
  return consumed;
}

export function ownsGeneration(
  generation: Pick<GenerationRow, "user_id" | "guest_key">,
  actor: Pick<GenerationActor, "userId" | "guestKey" | "legacyGuestKey">,
): boolean {
  return generation.user_id
    ? generation.user_id === actor.userId
    : generation.guest_key === actor.guestKey ||
        generation.guest_key === actor.legacyGuestKey;
}

function toAspectRatio(value: string): AspectRatio {
  switch (value) {
    case "1:1":
    case "4:5":
    case "3:4":
    case "2:3":
    case "9:16":
    case "16:9":
    case "4:3":
    case "3:2":
      return value;
    default:
      return "4:5";
  }
}

export function toGenerationAcceptedResponse(
  generation: Pick<
    GenerationRow,
    | "id"
    | "status"
    | "progress"
    | "aspect_ratio"
    | "input_type"
    | "reserved_credits"
    | "next_poll_at"
  >,
): GenerationAcceptedResponse {
  return {
    id: generation.id,
    status: toGenerationStatus(generation.status),
    progress: generation.progress,
    aspectRatio: toAspectRatio(generation.aspect_ratio),
    creditsReserved: generation.reserved_credits,
    ...(toInputType(generation.input_type)
      ? { inputType: toInputType(generation.input_type) }
      : {}),
    ...(generation.next_poll_at ? { nextPollAt: generation.next_poll_at } : {}),
  };
}

export function toGenerationStatus(value: string): GenerationStatus {
  switch (value) {
    case "submitted":
    case "processing":
    case "succeeded":
    case "partially_succeeded":
    case "failed":
    case "timed_out":
      return value;
    default:
      return "failed";
  }
}

function toInputType(
  value: string | null | undefined,
): "idea" | "url" | "text" | undefined {
  if (value === "idea" || value === "url" || value === "text") {
    return value;
  }
  return undefined;
}

export function toGenerationResponse(
  value: GenerationWithAssets,
  imageUrls: readonly string[],
  consumedByGenerationId: Readonly<Record<string, number>> = {},
): GenerationResponse {
  const status = toGenerationStatus(value.generation.status);
  const consumed = consumedByGenerationId[value.generation.id];
  const expiresAt = value.assets
    .map((asset) => asset.expires_at)
    .filter((expiry): expiry is string => expiry !== null)
    .sort()[0];
  return {
    id: value.generation.id,
    status,
    progress: value.generation.progress,
    aspectRatio: toAspectRatio(value.generation.aspect_ratio),
    prompt: value.generation.prompt,
    ...(toInputType(value.generation.input_type)
      ? { inputType: toInputType(value.generation.input_type) }
      : {}),
    createdAt: value.generation.created_at,
    ...(expiresAt ? { expiresAt } : {}),
    images: value.assets.map((asset, index) => ({
      id: asset.id,
      url: imageUrls[index] ?? "",
      alt: asset.alt_text,
      watermarked: asset.watermarked,
    })),
    ...(value.generation.error_message
      ? { error: value.generation.error_message }
      : {}),
    creditsReserved: value.generation.reserved_credits,
    ...(consumed !== undefined ? { creditsConsumed: consumed } : {}),
    imageCount: value.generation.image_count,
    ...(value.generation.next_poll_at
      ? { nextPollAt: value.generation.next_poll_at }
      : {}),
  };
}
