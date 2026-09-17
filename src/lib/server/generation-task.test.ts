import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ProviderTask, parseProviderTaskResponse } from "./apimart";
import { applyProviderTask } from "./generation-task";
import type { GenerationRow } from "./generation-types";

type QueryBuilder = {
  update: (values: Record<string, unknown>) => QueryBuilder;
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  single: () => Promise<{ data: unknown; error: null }>;
};

const mocks = vi.hoisted(() => ({
  failLimitedGeneration: vi.fn(),
  settleGenerationCredits: vi.fn(),
  lastUpdate: {} as Record<string, unknown>,
}));

vi.mock("./generation-settlement", () => ({
  failLimitedGeneration: mocks.failLimitedGeneration,
  settleGenerationCredits: mocks.settleGenerationCredits,
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const builder: QueryBuilder = {
        update: (values) => {
          mocks.lastUpdate = values;
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        single: () =>
          Promise.resolve({
            data: { id: "gen-1", ...mocks.lastUpdate },
            error: null,
          }),
      };
      return builder;
    },
  }),
}));

const generation = {
  id: "gen-1",
  mode: "guest",
  prompt: "A poster",
  progress: 30,
  image_count: 1,
} as unknown as GenerationRow;

function parseTask(payload: unknown): ProviderTask {
  const task = parseProviderTaskResponse(payload);
  if (!task) {
    throw new Error("expected the provider task to parse");
  }
  return task;
}

describe("applyProviderTask", () => {
  beforeEach(() => {
    mocks.failLimitedGeneration.mockReset();
    mocks.settleGenerationCredits.mockReset();
    mocks.lastUpdate = {};
  });

  it("fails the generation with the provider message and reason code", async () => {
    const task = parseTask({
      code: 200,
      data: {
        id: "task-01M2NZ6YSJ05C27SE40RGYATSA",
        status: "failed",
        progress: 100,
        error: {
          code: "task_failed",
          message:
            "Your prompt or input was rejected by the content safety system.",
          param: "",
          type: "task_failed",
        },
      },
    });
    mocks.failLimitedGeneration.mockResolvedValue(true);

    const updated = await applyProviderTask(generation, task);

    expect(mocks.failLimitedGeneration).toHaveBeenCalledWith(
      "gen-1",
      "failed",
      "Your prompt or input was rejected by the content safety system.",
      "PROVIDER_CONTENT_POLICY",
    );
    // 访客没有预扣积分，失败路径不应触发结算
    expect(mocks.settleGenerationCredits).not.toHaveBeenCalled();
    expect(updated.id).toBe("gen-1");
  });

  it("keeps polling when the provider reports an unknown status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const task = parseTask({
      code: 200,
      data: { id: "task-1", status: "moderated", progress: 40 },
    });

    const updated = await applyProviderTask(generation, task);

    expect(mocks.failLimitedGeneration).not.toHaveBeenCalled();
    expect(mocks.lastUpdate).toMatchObject({
      status: "processing",
      progress: 40,
    });
    expect(updated.status).toBe("processing");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
