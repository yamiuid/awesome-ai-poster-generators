import { describe, expect, it } from "vitest";
import {
  flattenRecentPosterImages,
  isVisibleGuestHistory,
  isVisibleGuestRecent,
} from "./generation-history";
import type { GenerationResponse } from "./poster";

function posterImage(
  overrides: Partial<GenerationResponse["images"][number]> = {},
): GenerationResponse["images"][number] {
  return {
    id: "image-1",
    url: "https://example.com/poster.png",
    alt: "A paper moon over a quiet city",
    watermarked: true,
    ...overrides,
  };
}

function generation(
  overrides: Partial<GenerationResponse> = {},
): GenerationResponse {
  return {
    id: "generation-1",
    status: "succeeded",
    progress: 100,
    aspectRatio: "4:5",
    prompt: "A paper moon over a quiet city",
    createdAt: "2026-08-14T12:00:00.000Z",
    expiresAt: "2026-08-15T12:00:00.000Z",
    images: [posterImage()],
    imageCount: 1,
    creditsReserved: 1,
    ...overrides,
  };
}

describe("guest generation history", () => {
  it("only exposes successful generations with at least one image", () => {
    expect(isVisibleGuestHistory(generation())).toBe(true);
    expect(
      isVisibleGuestHistory(generation({ status: "partially_succeeded" })),
    ).toBe(true);
    expect(isVisibleGuestHistory(generation({ status: "failed" }))).toBe(false);
    expect(isVisibleGuestHistory(generation({ status: "timed_out" }))).toBe(
      false,
    );
    expect(
      isVisibleGuestHistory(generation({ images: [posterImage({ url: "" })] })),
    ).toBe(false);
  });

  it("keeps failed generations in recent history without treating them as posters", () => {
    expect(isVisibleGuestRecent(generation({ status: "failed" }))).toBe(true);
    expect(isVisibleGuestRecent(generation({ status: "timed_out" }))).toBe(
      true,
    );
    expect(
      isVisibleGuestRecent(generation({ status: "succeeded", images: [] })),
    ).toBe(false);
  });

  it("flattens images newest first and skips empty image URLs", () => {
    const newest = generation({
      id: "generation-newest",
      createdAt: "2026-08-14T13:00:00.000Z",
      images: [
        posterImage(),
        posterImage({ id: "image-2", url: "https://example.com/second.png" }),
      ],
    });
    const older = generation({
      id: "generation-older",
      createdAt: "2026-08-14T11:00:00.000Z",
      images: [posterImage({ url: "" })],
    });

    expect(flattenRecentPosterImages([older, newest])).toEqual([
      expect.objectContaining({
        generationId: "generation-newest",
        aspectRatio: "4:5",
        image: expect.objectContaining({ id: "image-1" }),
      }),
      expect.objectContaining({
        generationId: "generation-newest",
        image: expect.objectContaining({ id: "image-2" }),
      }),
    ]);
  });
});
