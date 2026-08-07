import { describe, expect, it } from "vitest";
import type { GenerationRow } from "./generation-types";
import { ownsGeneration, toGenerationResponse } from "./generation-types";

const generation: GenerationRow = {
  id: "gen-1",
  user_id: "user-1",
  guest_key: null,
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
        { userId: "user-1", guestKey: "new-browser" },
      ),
    ).toBe(true);
  });

  it("authorizes guest generations only by guest key", () => {
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        { userId: null, guestKey: "guest-1" },
      ),
    ).toBe(true);
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        { userId: null, guestKey: "guest-2" },
      ),
    ).toBe(false);
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
