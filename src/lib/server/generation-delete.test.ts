import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteGeneration } from "./generation-delete";
import type { GenerationActor } from "./generation-types";

const mocks = vi.hoisted(() => ({
  generation: null as null | {
    id: string;
    user_id: string | null;
    guest_key: string | null;
  },
  assets: [] as { storage_path: string }[],
  readError: null as null | { message: string },
  deleteError: null as null | { message: string },
  order: [] as string[],
  deletedPaths: null as null | readonly string[],
  storageError: null as null | Error,
}));

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "generations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                mocks.order.push("read");
                return {
                  data: mocks.generation,
                  error: mocks.readError,
                };
              },
            }),
          }),
          delete: () => ({
            eq: async () => {
              mocks.order.push("delete-row");
              return { error: mocks.deleteError };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => {
            mocks.order.push("read-assets");
            return { data: mocks.assets };
          },
        }),
      };
    },
  }),
}));

vi.mock("./storage", () => ({
  deletePoster: async (paths: readonly string[]) => {
    mocks.order.push("delete-files");
    if (mocks.storageError) {
      throw mocks.storageError;
    }
    mocks.deletedPaths = paths;
  },
}));

const actor: GenerationActor = {
  userId: "user-1",
  guestKey: "guest-key",
  guestLimitKey: "guest-limit-key",
  legacyGuestKey: "legacy-key",
  mode: "free",
};

describe("deleteGeneration", () => {
  beforeEach(() => {
    mocks.generation = {
      id: "gen-1",
      user_id: "user-1",
      guest_key: null,
    };
    mocks.assets = [{ storage_path: "user-1/gen-1/0.png" }];
    mocks.readError = null;
    mocks.deleteError = null;
    mocks.order = [];
    mocks.deletedPaths = null;
    mocks.storageError = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("removes the files before the row so nothing is orphaned", async () => {
    await deleteGeneration("gen-1", actor);

    expect(mocks.order).toEqual([
      "read",
      "read-assets",
      "delete-files",
      "delete-row",
    ]);
    expect(mocks.deletedPaths).toEqual(["user-1/gen-1/0.png"]);
  });

  it("skips storage when the generation has no assets", async () => {
    mocks.assets = [];

    await deleteGeneration("gen-1", actor);

    expect(mocks.order).toEqual(["read", "read-assets", "delete-row"]);
  });

  it("refuses a generation owned by somebody else", async () => {
    mocks.generation = {
      id: "gen-1",
      user_id: "user-2",
      guest_key: null,
    };

    await expect(deleteGeneration("gen-1", actor)).rejects.toMatchObject({
      code: "GENERATION_NOT_FOUND",
      status: 404,
    });
    expect(mocks.order).toEqual(["read"]);
  });

  it("reports a missing generation as not found", async () => {
    mocks.generation = null;

    await expect(deleteGeneration("gen-1", actor)).rejects.toMatchObject({
      code: "GENERATION_NOT_FOUND",
    });
  });

  it("keeps the row when the files could not be deleted", async () => {
    mocks.storageError = new Error("storage down");

    await expect(deleteGeneration("gen-1", actor)).rejects.toThrow(
      "storage down",
    );
    expect(mocks.order).toEqual(["read", "read-assets", "delete-files"]);
  });

  it("surfaces a row deletion failure", async () => {
    mocks.deleteError = { message: "deadlock" };

    await expect(deleteGeneration("gen-1", actor)).rejects.toMatchObject({
      code: "GENERATION_DELETE_FAILED",
      status: 503,
    });
  });
});
