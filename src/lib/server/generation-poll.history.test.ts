import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRecentGenerations } from "./generation-poll";
import type {
  AssetRow,
  GenerationActor,
  GenerationRow,
} from "./generation-types";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  sign: vi.fn<(paths: readonly string[]) => Promise<string[]>>(),
}));

vi.mock("./supabase/admin", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://history.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => mocks.fetch(...args) },
  });
  return { createSupabaseAdminClient: () => client };
});
vi.mock("./storage", () => ({ createPosterUrls: mocks.sign }));

const actor: GenerationActor = {
  userId: "user-1",
  guestKey: "guest-1",
  guestLimitKey: "limit-1",
  legacyGuestKey: "guest-1",
  mode: "pro",
};

function generation(id: string, status = "succeeded"): GenerationRow {
  return {
    id,
    user_id: actor.userId,
    guest_key: null,
    guest_limit_key: null,
    guest_claimed_at: null,
    provider_task_id: null,
    prompt: `Poster ${id}`,
    style: "movie",
    aspect_ratio: "4:5",
    resolution: "1k",
    quality: "low",
    image_count: 1,
    reference_count: 0,
    mode: "pro",
    status,
    progress: status === "succeeded" ? 100 : 0,
    reserved_credits: 2,
    poll_failures: 0,
    input_type: "idea",
    error_code: null,
    error_message: null,
    next_poll_at: null,
    submitted_at: "2026-10-16T00:00:00Z",
    completed_at: null,
    created_at: "2026-10-16T00:00:00Z",
  };
}

function asset(id: string, generationId: string): AssetRow {
  return {
    id,
    generation_id: generationId,
    user_id: actor.userId,
    guest_key: null,
    storage_path: `${generationId}/${id}.png`,
    alt_text: id,
    watermarked: false,
    expires_at: null,
    created_at: "2026-10-16T00:00:00Z",
  };
}

function serveHistory(
  active: readonly GenerationRow[],
  recent: readonly GenerationRow[],
  assets: readonly AssetRow[] = [],
  assetStatus = 200,
): URL[] {
  const requests: URL[] = [];
  mocks.fetch.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    let data: unknown;
    let status = 200;
    switch (url.pathname) {
      case "/rest/v1/generations":
        data = url.searchParams.get("status")?.includes("submitted")
          ? active
          : recent;
        break;
      case "/rest/v1/generated_assets":
        data = assetStatus === 200 ? assets : { message: "asset read failed" };
        status = assetStatus;
        break;
      case "/rest/v1/credit_transactions":
        data = [
          { generation_id: "recent-0", amount: 1 },
          { generation_id: "recent-0", amount: 1 },
        ];
        break;
      default:
        throw new Error(`Unexpected request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return requests;
}

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.sign.mockReset();
  mocks.sign.mockImplementation(async (paths) =>
    paths.map((path) => `https://images.test/${path}`),
  );
});

describe("recent history batching", () => {
  it("uses four database reads when listing twenty recent tasks and an active task", async () => {
    // Given: interleaved assets from multiple tasks and a split credit charge.
    const recent = Array.from({ length: 20 }, (_, i) =>
      generation(`recent-${i}`),
    );
    const assets = [
      asset("image-a", "recent-1"),
      asset("image-b", "recent-0"),
      asset("image-c", "recent-1"),
    ];
    const requests = serveHistory(
      [generation("active", "processing")],
      recent,
      assets,
    );

    // When: the authorized user's history is loaded.
    const result = await listRecentGenerations(actor);

    // Then: batched reads preserve task/image order, URL ownership and credit totals.
    expect(requests).toHaveLength(4);
    expect(
      requests.filter((url) => url.pathname.endsWith("generations")),
    ).toSatisfy((urls: URL[]) =>
      urls.every((url) => url.searchParams.get("user_id") === "eq.user-1"),
    );
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(
      assets.map((row) => row.storage_path),
    );
    expect(result.active.map((row) => row.id)).toEqual(["active"]);
    expect(result.recent.map((row) => row.id)).toEqual(
      recent.map((row) => row.id),
    );
    expect(result.recent[0]?.creditsConsumed).toBe(2);
    expect(result.recent[1]?.creditsConsumed).toBeUndefined();
    expect(
      result.recent[1]?.images.map((image) => [image.id, image.url]),
    ).toEqual([
      ["image-a", "https://images.test/recent-1/image-a.png"],
      ["image-c", "https://images.test/recent-1/image-c.png"],
    ]);
    const assetQuery = requests.find((url) =>
      url.pathname.endsWith("generated_assets"),
    );
    expect(assetQuery?.searchParams.get("generation_id")).toContain(
      "active,recent-0",
    );
    expect(assetQuery?.searchParams.get("or")).toMatch(
      /^\(expires_at\.is\.null,expires_at\.gt\./,
    );
  });

  it("skips asset and credit reads when history is empty", async () => {
    // Given: neither active nor recent tasks exist.
    const requests = serveHistory([], []);
    // When: history is loaded.
    const result = await listRecentGenerations(actor);
    // Then: only the two task queries execute.
    expect(result).toEqual({ active: [], recent: [] });
    expect(requests).toHaveLength(2);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("preserves guest ownership filters and hides successful rows without images", async () => {
    // Given: a guest has a visible poster, a failed task and an expired poster.
    const requests = serveHistory(
      [],
      [
        generation("visible"),
        generation("failed", "failed"),
        generation("expired"),
      ],
      [asset("preview", "visible")],
    );
    // When: history is loaded under the guest identity.
    const result = await listRecentGenerations({
      ...actor,
      userId: null,
      mode: "guest",
    });
    // Then: guest filtering remains intact after batch serialization.
    expect(result.recent.map((row) => row.id)).toEqual(["visible", "failed"]);
    for (const url of requests.filter((url) =>
      url.pathname.endsWith("generations"),
    )) {
      expect(url.searchParams.get("guest_key")).toBe("in.(guest-1)");
      expect(url.searchParams.get("user_id")).toBe("is.null");
    }
  });

  it("reports an asset query failure instead of returning empty images", async () => {
    // Given: tasks exist but their asset query fails.
    serveHistory([], [generation("recent-0")], [], 400);
    // When / Then: loading rejects with the existing asset failure code.
    await expect(listRecentGenerations(actor)).rejects.toMatchObject({
      code: "ASSET_READ_FAILED",
    });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
