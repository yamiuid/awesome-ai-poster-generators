import { HTTPError, type NormalizedOptions } from "ky";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverGeneration } from "./generation-poll";
import type { GenerationRow } from "./generation-types";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  getTask: vi.fn(),
  applyProviderTask: vi.fn(),
  failGeneration: vi.fn(),
  sendAlert: vi.fn(),
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const respond = () =>
        Promise.resolve({ data: mocks.rows.shift() ?? null, error: null });
      const chain = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        update: () => chain,
        insert: () => chain,
        delete: () => chain,
        maybeSingle: respond,
        single: respond,
      };
      return chain;
    },
  }),
}));

vi.mock("./apimart", async () => {
  const actual = await vi.importActual<typeof import("./apimart")>("./apimart");
  return { ...actual, getTask: mocks.getTask };
});

vi.mock("./generation-task", () => ({
  applyProviderTask: mocks.applyProviderTask,
  failGeneration: mocks.failGeneration,
}));

vi.mock("./storage", () => ({ createPosterUrls: vi.fn() }));
vi.mock("./alerts", () => ({ sendAlert: mocks.sendAlert }));

const HARD_TIMEOUT_MS = 15 * 60 * 1_000;

function generationRow(overrides: Partial<GenerationRow> = {}): GenerationRow {
  const submittedAt = new Date(
    Date.now() - HARD_TIMEOUT_MS - 60_000,
  ).toISOString();
  return {
    id: "gen-1",
    user_id: null,
    guest_key: "guest-key",
    guest_limit_key: "guest-limit-key",
    guest_claimed_at: submittedAt,
    provider_task_id: "task-1",
    prompt: "A red editorial poster",
    style: "auto",
    aspect_ratio: "2:3",
    resolution: "1k",
    quality: "low",
    mode: "guest",
    status: "submitted",
    progress: 0,
    reserved_credits: 0,
    error_code: null,
    error_message: null,
    next_poll_at: new Date(Date.now() - 60_000).toISOString(),
    submitted_at: submittedAt,
    completed_at: null,
    created_at: submittedAt,
    image_count: 1,
    poll_failures: 0,
    input_type: "idea",
    reference_count: 0,
    reference_urls: [],
    ...overrides,
  } as GenerationRow;
}

describe("hard timeout recheck", () => {
  const row = generationRow();
  const claimed = generationRow({ status: "processing" });

  beforeEach(() => {
    mocks.rows = [row, claimed];
    mocks.getTask.mockReset();
    mocks.applyProviderTask.mockReset();
    mocks.applyProviderTask.mockResolvedValue({
      ...claimed,
      status: "succeeded",
    });
    mocks.failGeneration.mockReset();
    mocks.failGeneration.mockResolvedValue({ ...claimed, status: "timed_out" });
    mocks.sendAlert.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("delivers the poster when the provider finished after the user left", async () => {
    const task = { id: "task-1", status: "completed", progress: 100 };
    mocks.getTask.mockResolvedValue(task);

    const result = await recoverGeneration("gen-1");

    expect(mocks.applyProviderTask).toHaveBeenCalledWith(claimed, task);
    expect(mocks.failGeneration).not.toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
  });

  it("records the provider's own rejection instead of a timeout", async () => {
    const task = {
      id: "task-1",
      status: "failed",
      error: { code: "task_failed", message: "content safety rejection" },
    };
    mocks.getTask.mockResolvedValue(task);

    await recoverGeneration("gen-1");

    expect(mocks.applyProviderTask).toHaveBeenCalledWith(claimed, task);
    expect(mocks.failGeneration).not.toHaveBeenCalled();
  });

  it("still times out a task the provider is genuinely still working on", async () => {
    mocks.getTask.mockResolvedValue({ id: "task-1", status: "pending" });

    await recoverGeneration("gen-1");

    expect(mocks.applyProviderTask).not.toHaveBeenCalled();
    expect(mocks.failGeneration).toHaveBeenCalledWith(
      claimed,
      expect.stringContaining("took too long"),
      "timed_out",
      "GENERATION_TIMEOUT",
    );
  });

  it("reports a vanished provider task as failed, not as a timeout", async () => {
    mocks.getTask.mockRejectedValue(
      new HTTPError(
        new Response(null, { status: 404 }),
        new Request("https://api.apimart.ai/v1/tasks/task-1"),
        {} as NormalizedOptions,
      ),
    );

    await recoverGeneration("gen-1");

    expect(mocks.failGeneration).toHaveBeenCalledWith(
      claimed,
      expect.stringContaining("no longer has this generation"),
      "failed",
      "PROVIDER_TASK_MISSING",
    );
  });

  it("falls back to the timeout when the provider cannot be reached at all", async () => {
    mocks.getTask.mockRejectedValue(new Error("socket hang up"));

    await recoverGeneration("gen-1");

    expect(mocks.failGeneration).toHaveBeenCalledWith(
      claimed,
      expect.stringContaining("took too long"),
      "timed_out",
      "GENERATION_TIMEOUT",
    );
  });
});
