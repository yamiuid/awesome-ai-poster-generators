import { beforeEach, describe, expect, it, vi } from "vitest";
import { failLimitedGeneration } from "./generation-settlement";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  updateError: null as { message: string } | null,
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

describe("failLimitedGeneration", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.update.mockReset();
    mocks.eq.mockReset();
    mocks.updateError = null;
    mocks.rpc.mockResolvedValue({ data: { updated: true }, error: null });
    mocks.from.mockImplementation(() => ({
      update: (values: Record<string, unknown>) => {
        mocks.update(values);
        return {
          eq: (column: string, value: unknown) => {
            mocks.eq(column, value);
            return Promise.resolve({ error: mocks.updateError });
          },
        };
      },
    }));
  });

  it("records the reason code alongside the failure", async () => {
    const updated = await failLimitedGeneration(
      "gen-1",
      "failed",
      "Rejected by the content safety system.",
      "task_failed",
    );

    expect(updated).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("fail_limited_generation", {
      p_generation_id: "gen-1",
      p_status: "failed",
      p_message: "Rejected by the content safety system.",
    });
    expect(mocks.from).toHaveBeenCalledWith("generations");
    expect(mocks.update).toHaveBeenCalledWith({ error_code: "task_failed" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "gen-1");
  });

  it("keeps the failure when the reason code cannot be stored", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateError = { message: "column error_code does not exist" };

    await expect(
      failLimitedGeneration(
        "gen-1",
        "timed_out",
        "Timeout",
        "PROVIDER_TIMEOUT",
      ),
    ).resolves.toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("skips the reason code when the row was already settled", async () => {
    mocks.rpc.mockResolvedValue({ data: { updated: false }, error: null });

    await expect(
      failLimitedGeneration("gen-1", "failed", "Rejected", "task_failed"),
    ).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
