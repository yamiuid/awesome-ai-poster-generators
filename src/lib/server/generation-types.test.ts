import { describe, expect, it } from "vitest";
import type { GenerationRow } from "./generation-types";
import {
  ownsGeneration,
  toGenerationAcceptedResponse,
  toGenerationResponse,
} from "./generation-types";

const generation: GenerationRow = {
  id: "gen-1",
  user_id: "user-1",
  guest_key: null,
  guest_limit_key: null,
  guest_claimed_at: null,
  provider_task_id: "task-1",
  prompt: "A poster about testing",
  style: "movie",
  aspect_ratio: "4:5",
  resolution: "2k",
  quality: "high",
  image_count: 4,
  mode: "pro",
  status: "succeeded",
  progress: 100,
  reserved_credits: 744,
  error_code: null,
  error_message: null,
  next_poll_at: null,
  submitted_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:01:00Z",
  created_at: "2026-01-01T00:00:00Z",
};

describe("generation ownership", () => {
  it("authorizes signed-in users by stable user ID", () => {
    expect(
      ownsGeneration(
        { user_id: "user-1", guest_key: "old-browser" },
        {
          userId: "user-1",
          guestKey: "new-browser",
          legacyGuestKey: "legacy",
        },
      ),
    ).toBe(true);
  });

  it("authorizes guest generations only by guest key", () => {
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        {
          userId: null,
          guestKey: "guest-1",
          legacyGuestKey: "legacy",
        },
      ),
    ).toBe(true);
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        {
          userId: null,
          guestKey: "guest-2",
          legacyGuestKey: "legacy",
        },
      ),
    ).toBe(false);
  });

  it("accepts a legacy guest key during the ownership transition", () => {
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "legacy" },
        {
          userId: null,
          guestKey: "stable",
          legacyGuestKey: "legacy",
        },
      ),
    ).toBe(true);
  });
});

describe("toGenerationResponse credits", () => {
  it("surfaces consumed credits when a consume row exists", () => {
    const response = toGenerationResponse({ generation, assets: [] }, [], {
      "gen-1": 372,
    });
    expect(response.creditsReserved).toBe(744);
    expect(response.creditsConsumed).toBe(372);
  });

  it("omits creditsConsumed when no consume row exists", () => {
    const response = toGenerationResponse({ generation, assets: [] }, []);
    expect(response.creditsConsumed).toBeUndefined();
  });
});

describe("toGenerationResponse presentation", () => {
  it("preserves the requested aspect ratio for result rendering", () => {
    // Given: a completed wide generation.
    const wideGeneration = { ...generation, aspect_ratio: "16:9" };

    // When: the database row is mapped to the browser response.
    const response = toGenerationResponse(
      { generation: wideGeneration, assets: [] },
      [],
    );

    // Then: the client receives the ratio needed to avoid cropping the poster.
    expect(response.aspectRatio).toBe("16:9");
    expect(response.prompt).toBe(generation.prompt);
    expect(response.createdAt).toBe(generation.created_at);
  });
});

describe("generation creation contract", () => {
  it("includes the requested aspect ratio in the accepted response", () => {
    const response = toGenerationAcceptedResponse(generation);

    expect(response).toEqual({
      id: generation.id,
      status: generation.status,
      progress: generation.progress,
      aspectRatio: "4:5",
      creditsReserved: generation.reserved_credits,
    });
  });
});
