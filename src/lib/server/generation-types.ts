import type {
  GenerationMode,
  GenerationResponse,
  GenerationStatus,
} from "@/lib/domain/poster";
import type { Database } from "./supabase/types";

export type GenerationActor = Readonly<{
  userId: string | null;
  guestKey: string;
  mode: GenerationMode;
}>;

export type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];
export type AssetRow = Database["public"]["Tables"]["generated_assets"]["Row"];

export type GenerationWithAssets = Readonly<{
  generation: GenerationRow;
  assets: readonly AssetRow[];
}>;

export function ownsGeneration(
  generation: Pick<GenerationRow, "user_id" | "guest_key">,
  actor: Pick<GenerationActor, "userId" | "guestKey">,
): boolean {
  return generation.user_id
    ? generation.user_id === actor.userId
    : generation.guest_key === actor.guestKey;
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

export function toGenerationResponse(
  value: GenerationWithAssets,
  imageUrls: readonly string[],
): GenerationResponse {
  const status = toGenerationStatus(value.generation.status);
  return {
    id: value.generation.id,
    status,
    progress: value.generation.progress,
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
    imageCount: value.generation.image_count,
    ...(value.generation.next_poll_at
      ? { nextPollAt: value.generation.next_poll_at }
      : {}),
  };
}
