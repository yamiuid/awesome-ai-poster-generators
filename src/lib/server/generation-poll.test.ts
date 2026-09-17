import { HTTPError, type NormalizedOptions } from "ky";
import { describe, expect, it, vi } from "vitest";
import {
  isMissingProviderTaskError,
  isRecoverableTimedOutGeneration,
  recentHistoryWindow,
} from "./generation-poll";

const DAY_MS = 24 * 60 * 60 * 1_000;

describe("generation recovery", () => {
  it("rechecks timeout rows created by the local poll failure guard", () => {
    const generation = {
      status: "timed_out",
      provider_task_id: "task-1",
      poll_failures: 11,
      error_message:
        "The image service stopped responding and your credits were returned.",
    };

    expect(isRecoverableTimedOutGeneration(generation)).toBe(true);
  });

  it("leaves rows retried a few times alone", () => {
    expect(
      isRecoverableTimedOutGeneration({
        status: "timed_out",
        provider_task_id: "task-1",
        poll_failures: 3,
        error_message:
          "The image service stopped responding and your credits were returned.",
      }),
    ).toBe(false);
  });
});

describe("isMissingProviderTaskError", () => {
  const httpError = (status: number): HTTPError =>
    new HTTPError(
      new Response(null, { status }),
      new Request("https://api.apimart.ai/v1/tasks/task-1"),
      {} as NormalizedOptions,
    );

  it("treats a vanished task as terminal", () => {
    expect(isMissingProviderTaskError(httpError(400))).toBe(true);
    expect(isMissingProviderTaskError(httpError(404))).toBe(true);
  });

  it("keeps other failures retryable", () => {
    expect(isMissingProviderTaskError(httpError(503))).toBe(false);
    expect(isMissingProviderTaskError(new Error("socket hang up"))).toBe(false);
    expect(isMissingProviderTaskError(null)).toBe(false);
  });
});

describe("recentHistoryWindow", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const daysBetween = (iso: string | null): number =>
    iso === null ? Number.NaN : (now.getTime() - Date.parse(iso)) / DAY_MS;

  it("covers the guest retention window of one day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(daysBetween(recentHistoryWindow("guest"))).toBe(1);
    vi.useRealTimers();
  });

  it("covers the signed-in free retention window of seven days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(daysBetween(recentHistoryWindow("free"))).toBe(7);
    vi.useRealTimers();
  });

  it("leaves Pro history unbounded because its assets never expire", () => {
    expect(recentHistoryWindow("pro")).toBeNull();
  });
});
