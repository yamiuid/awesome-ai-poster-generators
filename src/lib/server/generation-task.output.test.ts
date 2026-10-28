import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyProviderTask } from "./generation-task";
import type { GenerationRow } from "./generation-types";

const output = vi.hoisted(() => ({
  row: {} as GenerationRow,
  asset: {} as Record<string, unknown>,
  upload: vi.fn(),
  watermark: vi.fn(),
  subscription: { period_end: "2027-01-01T00:00:00Z" } as { period_end: string } | null,
  pack: null as { created_at: string } | null,
}));
vi.mock("./storage", () => ({
  downloadProviderImage: async () => Buffer.from("original"),
  uploadPoster: output.upload,
}));
vi.mock("./image-ops", () => ({ bakeWatermark: output.watermark }));
vi.mock("./generation-settlement", () => ({
  settleGenerationCredits: vi.fn(),
}));
vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const query = {
        update: (values: Partial<GenerationRow>) => {
          Object.assign(output.row, values);
          return query;
        },
        select: () => query,
        eq: () =>
          table === "generated_assets"
            ? Promise.resolve({ data: [], error: null })
            : query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: table === "subscriptions" ? output.subscription : output.pack, error: null }),
        single: async () => ({ data: output.row, error: null }),
        insert: async (values: Record<string, unknown>) => {
          output.asset = values;
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

describe("stored output access", () => {
  beforeEach(() => {
    output.upload.mockReset();
    output.watermark.mockReset().mockResolvedValue(Buffer.from("watermarked"));
    output.subscription = { period_end: "2027-01-01T00:00:00Z" };
    output.pack = null;
  });

  it.each(["guest", "free", "pro"])(
    "stores only the entitled file for %s",
    async (mode) => {
      // Given: a completed provider image for the selected tier.
      output.row = {
        id: "gen",
        user_id: mode === "guest" ? null : "user",
        guest_key: "guest",
        mode,
        prompt: "A poster",
        progress: 30,
        image_count: 1,
        resolution: mode === "pro" ? "2k" : "1k",
        quality: mode === "pro" ? "high" : "low",
        created_at: "2026-10-27T00:00:00Z",
      } as GenerationRow;
      // When: the provider output is persisted.
      await applyProviderTask(output.row, {
        id: "task",
        status: "completed",
        result: { images: [{ url: ["https://example.com/image.png"] }] },
      });
      // Then: free originals are never uploaded; paid output remains clean.
      expect(output.asset["watermarked"]).toBe(mode !== "pro");
      expect(output.upload).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        Buffer.from(mode === "pro" ? "original" : "watermarked"),
      );
      expect(output.watermark).toHaveBeenCalledTimes(mode === "pro" ? 0 : 1);
    },
  );

  it("retains each pack image for 180 days after generation when the subscription has expired", async () => {
    // Given: a pack purchase after an expired subscription.
    output.subscription = { period_end: "2026-01-01T00:00:00Z" };
    output.pack = { created_at: "2026-10-01T00:00:00Z" };
    output.row = {
      id: "gen", user_id: "user", mode: "pro", prompt: "poster", progress: 0,
      image_count: 1, resolution: "1k", quality: "low", created_at: "2026-10-27T00:00:00Z",
    } as GenerationRow;
    // When: the generated output is stored.
    await applyProviderTask(output.row, {
      id: "task", status: "completed", result: { images: [{ url: ["https://example.com/image.png"] }] },
    });
    // Then: old non-expiring credits cannot produce an already-expired image.
    expect(output.asset["expires_at"]).toBe("2027-04-25T00:00:00.000Z");
  });
});
