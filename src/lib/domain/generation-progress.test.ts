import { describe, expect, it } from "vitest";
import {
  displayedProgress,
  FINALIZING_PROGRESS,
  generationAction,
  generationFailureMessage,
  generationFailureMessageKey,
  generationFailureStatus,
  generationOverlayLabel,
  generationPhase,
  generationPollDelay,
  generationStagePhase,
  mergeGenerationResponse,
  monotonicWorkingProgress,
  serverPollBackoffMs,
} from "./generation-progress";
import type { GenerationResponse } from "./poster";

const generation = (
  overrides: Partial<GenerationResponse> = {},
): GenerationResponse => ({
  id: "generation-1",
  status: "processing",
  progress: 40,
  aspectRatio: "4:5",
  prompt: "A paper moon",
  createdAt: "2026-08-14T12:00:00.000Z",
  images: [],
  imageCount: 1,
  creditsReserved: 0,
  ...overrides,
});

describe("generation progress", () => {
  it("reports local finalization exhaustion as failed instead of timed out", () => {
    const status = generationFailureStatus("finalization", 5, 5);
    expect(status).toBe("failed");
  });

  it("keeps provider polling exhaustion as timed out", () => {
    expect(generationFailureStatus("provider_poll", 5, 5)).toBe("timed_out");
  });

  it("backs server polling off instead of hammering the provider", () => {
    expect(serverPollBackoffMs(0)).toBe(4_000);
    expect(serverPollBackoffMs(1)).toBe(8_000);
    expect(serverPollBackoffMs(2)).toBe(16_000);
    expect(serverPollBackoffMs(3)).toBe(32_000);
    expect(serverPollBackoffMs(4)).toBe(60_000);
    expect(serverPollBackoffMs(11)).toBe(60_000);
  });

  it("maps failure reason codes to localised copy", () => {
    expect(
      generationFailureMessageKey({ errorCode: "PROVIDER_CONTENT_POLICY" }),
    ).toBe("providerContentRejected");
    expect(
      generationFailureMessageKey({ errorCode: "PROVIDER_TIMEOUT" }),
    ).toBe("providerTimeout");
    expect(
      generationFailureMessageKey({ errorCode: "PROMPT_SAFETY_BLOCKED" }),
    ).toBe("safetyReviewFailed");
    expect(generationFailureMessageKey({})).toBeNull();
    expect(
      generationFailureMessageKey({ errorCode: "FINALIZATION_FAILED" }),
    ).toBeNull();
  });

  it("keeps the backend failure detail for the poster-ratio error state", () => {
    expect(
      generationFailureMessage({
        status: "failed",
        error: "The image service failed after generating the poster.",
      }),
    ).toBe("The image service failed after generating the poster.");
    expect(generationFailureMessage({ status: "timed_out" })).toBe(
      "The image service did not respond; your credits were returned.",
    );
  });

  it("maps submitting, provider work, finalization, reconnecting, and completion", () => {
    expect(
      generationPhase({ status: "submitted", progress: 0, isSubmitting: true }),
    ).toBe("submitting");
    expect(generationPhase({ status: "submitted", progress: 0 })).toBe(
      "queued",
    );
    expect(generationPhase({ status: "processing", progress: 24 })).toBe(
      "creating",
    );
    expect(generationPhase({ status: "processing", progress: 95 })).toBe(
      "finalizing",
    );
    expect(
      generationPhase({
        status: "processing",
        progress: 24,
        connectionFailures: 3,
      }),
    ).toBe("reconnecting");
    expect(
      generationStagePhase({
        status: "processing",
        progress: 95,
        connectionFailures: 3,
      }),
    ).toBe("finalizing");
    expect(generationPhase({ status: "succeeded", progress: 100 })).toBe(
      "complete",
    );
  });

  it("never regresses provider progress or exposes 100 before completion", () => {
    expect(monotonicWorkingProgress(42, 18, 95)).toBe(42);
    expect(monotonicWorkingProgress(42, 100, 94)).toBe(94);
    expect(monotonicWorkingProgress(42, 100, 95)).toBe(FINALIZING_PROGRESS);
    expect(monotonicWorkingProgress(95, 10, 95)).toBe(95);
    expect(displayedProgress({ status: "processing", progress: 100 })).toBe(95);
    expect(displayedProgress({ status: "succeeded", progress: 24 })).toBe(100);
  });

  it("refreshes terminal assets without regressing terminal status", () => {
    const previous = generation({
      status: "succeeded",
      progress: 100,
      images: [
        {
          id: "image-1",
          url: "https://example.com/expired.png",
          alt: "poster",
          watermarked: true,
        },
      ],
    });
    const refreshed = generation({
      status: "processing",
      progress: 95,
      images: [
        {
          id: "image-1",
          url: "https://example.com/refreshed.png",
          alt: "poster",
          watermarked: true,
        },
      ],
    });
    expect(mergeGenerationResponse(previous, refreshed)).toMatchObject({
      status: "succeeded",
      progress: 100,
      images: [{ url: "https://example.com/refreshed.png" }],
    });
  });

  it("uses an indeterminate progressbar when no real progress exists", () => {
    expect(displayedProgress({ status: "submitted", progress: 0 })).toBeNull();
    expect(displayedProgress({ status: "processing", progress: 0 })).toBeNull();
    expect(displayedProgress({ status: "processing", progress: 24 })).toBe(24);
  });

  it("maps each waiting stage to one short in-image message", () => {
    expect(generationOverlayLabel("submitting")).toBe("Submitting…");
    expect(generationOverlayLabel("queued")).toBe("Reading prompt…");
    expect(generationOverlayLabel("creating")).toBe("Generating…");
    expect(generationOverlayLabel("finalizing")).toBe("Loading poster…");
    expect(generationOverlayLabel("reconnecting")).toBe("Reconnecting…");
    expect(generationOverlayLabel("complete")).toBe("");
  });

  it("keeps free users to one task while Pro can submit another", () => {
    expect(generationAction(false, false, true)).toEqual({
      label: "Current poster is generating",
      disabled: true,
    });
    expect(generationAction(true, false, true)).toEqual({
      label: "Create another",
      disabled: false,
    });
    expect(generationAction(true, true, true)).toEqual({
      label: "Sending...",
      disabled: true,
    });
  });

  it("backs off failures and slows polling in a hidden tab", () => {
    expect(generationPollDelay(0, false)).toBe(4_000);
    expect(generationPollDelay(0, true)).toBe(20_000);
    expect(generationPollDelay(2, false)).toBe(16_000);
    expect(generationPollDelay(8, false)).toBe(30_000);
  });
});

describe("server-side recovery", () => {
  const recovered = generation({
    status: "succeeded",
    progress: 100,
    images: [
      {
        id: "image-1",
        url: "https://example.com/poster.png",
        alt: "poster",
        watermarked: false,
      },
    ],
  });

  it("adopts a successful server state over a local timeout", () => {
    // 客户端放弃后，cron 仍可能在服务端把任务补完（含落图），
    // 否则首页历史会一直显示那条没有图片的失败记录，而 /account 能看到图。
    expect(
      mergeGenerationResponse(generation({ status: "timed_out" }), recovered),
    ).toMatchObject({
      status: "succeeded",
      images: [{ url: "https://example.com/poster.png" }],
    });
  });

  it("adopts a partial success over a local failure", () => {
    expect(
      mergeGenerationResponse(
        generation({ status: "failed" }),
        generation({ status: "partially_succeeded", images: recovered.images }),
      ),
    ).toMatchObject({ status: "partially_succeeded" });
  });

  it("never downgrades a local success", () => {
    expect(
      mergeGenerationResponse(
        generation({ status: "succeeded", images: recovered.images }),
        generation({ status: "failed" }),
      ),
    ).toMatchObject({ status: "succeeded" });
  });

  it("keeps a local timeout when the server also reports a failure", () => {
    expect(
      mergeGenerationResponse(
        generation({ status: "timed_out" }),
        generation({ status: "failed" }),
      ),
    ).toMatchObject({ status: "timed_out" });
  });
});
