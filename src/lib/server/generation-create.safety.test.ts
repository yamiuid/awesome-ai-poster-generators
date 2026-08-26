import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "@/lib/domain/poster";
import { AppError } from "./errors";
import { createGeneration, getActorForRequest } from "./generation-create";
import type { GenerationRow } from "./generation-types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  query: {
    insert: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  },
  enforcePromptSafety: vi.fn(),
  failLimitedGeneration: vi.fn(),
  settleGenerationCredits: vi.fn(),
  submitGeneration: vi.fn(),
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

vi.mock("./prompt-safety", () => ({
  enforcePromptSafety: mocks.enforcePromptSafety,
}));

vi.mock("./generation-settlement", () => ({
  failLimitedGeneration: mocks.failLimitedGeneration,
  settleGenerationCredits: mocks.settleGenerationCredits,
}));

vi.mock("./apimart", () => ({
  submitGeneration: mocks.submitGeneration,
}));

const identity = {
  cookieValue: "cookie",
  key: "guest-key",
  limitKey: "guest-limit-key",
  legacyKey: "legacy-key",
} as const;

const generation: GenerationRow = {
  id: "gen-1",
  user_id: "user-1",
  guest_key: null,
  guest_limit_key: null,
  guest_claimed_at: null,
  provider_task_id: "task-1",
  prompt: "A red editorial poster",
  style: "auto",
  aspect_ratio: "4:5",
  resolution: "2k",
  quality: "high",
  image_count: 1,
  mode: "pro",
  status: "submitted",
  progress: 0,
  reserved_credits: 93,
  poll_failures: 0,
  input_type: "idea",
  error_code: null,
  error_message: null,
  next_poll_at: "2026-08-26T00:00:00.000Z",
  submitted_at: "2026-08-26T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-08-26T00:00:00.000Z",
};

const request: GenerationRequest = {
  prompt: generation.prompt,
  style: "auto",
  aspectRatio: "4:5",
  resolution: "2k",
  quality: "high",
  imageCount: 1,
};

describe("generation prompt safety integration", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    for (const method of Object.values(mocks.query)) {
      method.mockReset();
      method.mockReturnValue(mocks.query);
    }
    mocks.enforcePromptSafety.mockReset();
    mocks.failLimitedGeneration.mockReset();
    mocks.settleGenerationCredits.mockReset();
    mocks.submitGeneration.mockReset();
    mocks.enforcePromptSafety.mockRejectedValue(
      new AppError(
        "PROMPT_SAFETY_BLOCKED",
        "This prompt was blocked because it includes explicit adult sexual content. Revise the prompt and try again.",
        422,
      ),
    );
    mocks.failLimitedGeneration.mockResolvedValue(true);
    mocks.settleGenerationCredits.mockResolvedValue(undefined);
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.single.mockResolvedValue({ data: generation, error: null });
  });

  it("releases the Pro reservation without calling APIMart", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const actor = getActorForRequest("user-1", identity, true);

    await expect(createGeneration(actor, request)).rejects.toMatchObject({
      code: "PROMPT_SAFETY_BLOCKED",
      status: 422,
    });

    expect(mocks.enforcePromptSafety).toHaveBeenCalledWith(request.prompt);
    expect(mocks.submitGeneration).not.toHaveBeenCalled();
    expect(mocks.failLimitedGeneration).toHaveBeenCalledWith(
      generation.id,
      "failed",
      expect.stringContaining("explicit adult sexual content"),
    );
    expect(mocks.settleGenerationCredits).toHaveBeenCalledWith(
      generation.id,
      0,
      0,
    );
  });

  it("releases a guest quota claim without calling APIMart", async () => {
    const guestGeneration = {
      ...generation,
      id: "11111111-1111-4111-8111-111111111111",
      user_id: null,
      guest_key: identity.key,
      guest_limit_key: identity.limitKey,
      guest_claimed_at: "2026-08-26T00:00:00.000Z",
      mode: "guest" as const,
      resolution: "1k" as const,
      quality: "low" as const,
      reserved_credits: 0,
    };
    mocks.rpc.mockResolvedValue({
      data: { outcome: "created", generationId: guestGeneration.id },
      error: null,
    });
    mocks.query.single.mockResolvedValue({
      data: guestGeneration,
      error: null,
    });
    const actor = getActorForRequest(null, identity, false);
    const guestRequest = {
      ...request,
      resolution: "1k" as const,
      quality: "low" as const,
    };

    await expect(createGeneration(actor, guestRequest)).rejects.toMatchObject({
      code: "PROMPT_SAFETY_BLOCKED",
    });

    expect(mocks.submitGeneration).not.toHaveBeenCalled();
    expect(mocks.failLimitedGeneration).toHaveBeenCalledWith(
      guestGeneration.id,
      "failed",
      expect.any(String),
    );
    expect(mocks.settleGenerationCredits).not.toHaveBeenCalled();
  });
});
