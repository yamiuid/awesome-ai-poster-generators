import { describe, expect, it } from "vitest";
import { ownsGeneration } from "./generation-types";

describe("generation ownership", () => {
  it("authorizes signed-in users by stable user ID", () => {
    expect(
      ownsGeneration(
        { user_id: "user-1", guest_key: "old-browser" },
        { userId: "user-1", guestKey: "new-browser" },
      ),
    ).toBe(true);
  });

  it("authorizes guest generations only by guest key", () => {
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        { userId: null, guestKey: "guest-1" },
      ),
    ).toBe(true);
    expect(
      ownsGeneration(
        { user_id: null, guest_key: "guest-1" },
        { userId: null, guestKey: "guest-2" },
      ),
    ).toBe(false);
  });
});
