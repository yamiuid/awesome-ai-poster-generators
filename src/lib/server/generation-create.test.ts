import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "@/lib/domain/poster";
import { createGeneration, getActorForRequest } from "./generation-create";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

const identity = {
  cookieValue: "cookie",
  key: "guest-key",
  limitKey: "guest-limit-key",
  legacyKey: "legacy-key",
} as const;

const request: GenerationRequest = {
  prompt: "A red editorial poster",
  style: "auto",
  aspectRatio: "4:5",
  resolution: "1k",
  quality: "low",
  imageCount: 1,
};

describe("daily generation quota errors", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: { outcome: "quota_exhausted" },
      error: null,
    });
  });

  it("returns the guest limit error for an unauthenticated actor", async () => {
    const actor = getActorForRequest(null, identity, false);

    await expect(createGeneration(actor, request)).rejects.toMatchObject({
      code: "GUEST_LIMIT_REACHED",
      status: 429,
      message:
        "You have used your 1 free generation for today. Sign in or create an account for 4 free generations each day.",
    });
  });

  it("returns the free daily limit error for a signed-in actor", async () => {
    const actor = getActorForRequest("user-1", identity, false);

    await expect(createGeneration(actor, request)).rejects.toMatchObject({
      code: "FREE_DAILY_LIMIT_REACHED",
      status: 429,
      message:
        "You have used all 4 free generations for today. Upgrade to Pro or come back tomorrow.",
    });
  });
});
