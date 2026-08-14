import type { GenerationResponse } from "./poster";

const GUEST_HISTORY_STATUSES: ReadonlySet<GenerationResponse["status"]> =
  new Set(["succeeded", "partially_succeeded"]);

export type RecentPoster = Readonly<{
  generationId: string;
  createdAt: string;
  expiresAt?: string;
  prompt: string;
  image: GenerationResponse["images"][number];
}>;

export function isVisibleGuestHistory(generation: GenerationResponse): boolean {
  return (
    GUEST_HISTORY_STATUSES.has(generation.status) &&
    generation.images.some((image) => image.url.trim().length > 0)
  );
}

export function flattenRecentPosterImages(
  generations: readonly GenerationResponse[],
): RecentPoster[] {
  return generations
    .filter(isVisibleGuestHistory)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .flatMap((generation) =>
      generation.images
        .filter((image) => image.url.trim().length > 0)
        .map((image) => ({
          generationId: generation.id,
          createdAt: generation.createdAt,
          ...(generation.expiresAt ? { expiresAt: generation.expiresAt } : {}),
          prompt: generation.prompt,
          image,
        })),
    );
}
