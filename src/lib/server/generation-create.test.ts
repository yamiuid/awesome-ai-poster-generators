import { beforeEach, describe, expect, it, vi } from "vitest";
import { batchCreditCost } from "@/lib/domain/credits";
import type { GenerationRequest } from "@/lib/domain/poster";
import { createGeneration, getActorForRequest } from "./generation-create";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

const GENERATED_ID = "3f1d8f2a-6c4b-4e2f-9c1d-7a5b8e0d4c33";

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: mocks.rpc,
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: () =>
          Promise.resolve({
            data: {
              id: GENERATED_ID,
            },
            error: null,
          }),
      };
      return builder;
    },
  })),
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

describe("guest lifetime limit", () => {
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
        "You have used your 2 free guest generations. Sign in or create an account to claim 30 welcome credits.",
    });
  });
});

describe("credit-based free mode", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "create_limited_generation") {
        return Promise.resolve({
          data: {
            outcome: "created",
            generationId: GENERATED_ID,
          },
          error: null,
        });
      }
      if (fn === "reserve_credits") {
        return Promise.resolve({ data: false, error: null });
      }
      if (fn === "fail_limited_generation") {
        return Promise.resolve({ data: { updated: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("free actors pay credits for their chosen tier and fail with 402 when the balance is insufficient", async () => {
    const actor = getActorForRequest("user-1", identity, false);

    await expect(createGeneration(actor, request)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      status: 402,
    });

    const createCall = mocks.rpc.mock.calls.find(
      ([fn]) => fn === "create_limited_generation",
    );
    expect(createCall?.[1].p_reserved_credits).toBe(
      batchCreditCost("1k", "low", 1),
    );

    const reserveCall = mocks.rpc.mock.calls.find(
      ([fn]) => fn === "reserve_credits",
    );
    expect(reserveCall?.[1]).toMatchObject({
      p_user_id: "user-1",
      p_amount: batchCreditCost("1k", "low", 1),
    });
  });
});
