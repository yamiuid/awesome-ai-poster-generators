import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "@/lib/domain/poster";
import { createGeneration, getActorForRequest } from "./generation-create";
import { recoverGeneration } from "./generation-poll";
import type { GenerationRow } from "./generation-types";

const state = vi.hoisted(() => ({
  row: {} as GenerationRow,
  updates: [] as Record<string, unknown>[],
  submit: vi.fn(),
}));
vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string) => ({
      data:
        name === "create_limited_generation"
          ? { outcome: "created", generationId: state.row.id }
          : true,
      error: null,
    }),
    from: () => {
      let update: Record<string, unknown> | undefined;
      const result = async () => {
        if (update) {
          state.updates.push(update);
          Object.assign(state.row, update);
        }
        return { data: { ...state.row }, error: null };
      };
      const query = {
        update: (values: Record<string, unknown>) => {
          update = values;
          return query;
        },
        select: () => query,
        eq: () => query,
        lte: () => query,
        single: result,
        maybeSingle: result,
      };
      return query;
    },
  }),
}));
vi.mock("./prompt-safety", () => ({ enforcePromptSafety: vi.fn() }));
vi.mock("./prompt-language", () => ({
  detectPosterLanguage: async () => "en",
}));
vi.mock("./apimart", async (original) => ({
  ...(await original<typeof import("./apimart")>()),
  submitGeneration: state.submit,
}));

const request: GenerationRequest = {
  prompt: "An editorial poster",
  style: "auto",
  aspectRatio: "2:3",
  resolution: "4k",
  quality: "max",
  imageCount: 1,
};
const identity = {
  cookieValue: "cookie",
  key: "guest",
  limitKey: "network",
  legacyKey: "legacy",
};

describe("trial queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
    state.row = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "submitted",
      mode: "guest",
      provider_task_id: null,
      reserved_credits: 0,
      submitted_at: new Date().toISOString(),
      next_poll_at: new Date().toISOString(),
    } as GenerationRow;
    state.updates = [];
    state.submit.mockReset().mockResolvedValue({ taskId: "provider-task" });
  });

  it.each([
    [null, "1k", "low", 45_000],
    ["user", "1k", "low", 10_000],
  ] as const)(
    "defers %s provider cost until the server queue expires",
    async (userId, resolution, quality, delay) => {
      // Given: a trial actor requesting paid output parameters.
      const actor = getActorForRequest(userId, identity, false);
      // When: the request is queued and advanced before and after its deadline.
      const queued = await createGeneration(actor, request);
      expect(state.submit).not.toHaveBeenCalled();
      expect(Date.parse(queued.next_poll_at ?? "") - Date.now()).toBe(delay);
      await recoverGeneration(queued.id);
      expect(state.submit).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + delay);
      await recoverGeneration(queued.id);
      // Then: only one normalized request reaches the provider and retains a submission lease.
      expect(state.submit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ resolution, quality, imageCount: 1 }),
        expect.any(String),
      );
      expect(
        state.updates.some(
          (u) =>
            Date.parse(String(u["next_poll_at"])) === Date.now() + 15 * 60_000,
        ),
      ).toBe(true);
      vi.useRealTimers();
    },
  );

  it("rejects free batch requests before claiming credits or calling the provider", async () => {
    // Given: an unpaid registered actor.
    const actor = getActorForRequest("user", identity, false);
    // When / Then: direct API requests cannot bypass the single-poster restriction.
    await expect(
      createGeneration(actor, { ...request, imageCount: 4 }),
    ).rejects.toMatchObject({ code: "PAID_IMAGE_COUNT_LIMIT" });
    expect(state.submit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("submits a never-claimed trial even when the scheduler was offline for over 15 minutes", async () => {
    // Given: an untouched queued task after a scheduler outage.
    const queued = await createGeneration(getActorForRequest(null, identity, false), request);
    vi.setSystemTime(Date.now() + 20 * 60_000);
    // When: the scheduler recovers it.
    await recoverGeneration(queued.id);
    // Then: it is submitted once, with a fresh provider timeout.
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(state.row.submitted_at).toBe(new Date().toISOString());
    vi.useRealTimers();
  });

  it("holds an expired submission lease for review instead of submitting twice", async () => {
    // Given: a task was claimed, but no provider ID was saved before the lease expired.
    const queued = await createGeneration(getActorForRequest(null, identity, false), request);
    state.row.next_poll_at = new Date(Date.now() + 15 * 60_000).toISOString();
    vi.setSystemTime(Date.now() + 16 * 60_000);
    // When: recovery finds the expired lease.
    const recovered = await recoverGeneration(queued.id);
    // Then: no new provider request or automatic refund is made.
    expect(state.submit).not.toHaveBeenCalled();
    expect(recovered.error_code).toBe("PROVIDER_SUBMISSION_UNCERTAIN");
    expect(recovered.next_poll_at).toBeNull();
    vi.useRealTimers();
  });
});
