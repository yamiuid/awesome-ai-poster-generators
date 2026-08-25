import { describe, expect, it } from "vitest";
import { isRecoverableTimedOutGeneration } from "./generation-poll";

describe("generation recovery", () => {
  it("rechecks timeout rows created by the local poll failure guard", () => {
    const generation = {
      status: "timed_out",
      provider_task_id: "task-1",
      poll_failures: 4,
      error_message:
        "The image service stopped responding and your credits were returned.",
    };

    expect(isRecoverableTimedOutGeneration(generation)).toBe(true);
  });
});
