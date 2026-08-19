import type { GenerationResponse, GenerationStatus } from "./poster";

export const FINALIZING_PROGRESS = 95;
export const PROVIDER_PROGRESS_CEILING = FINALIZING_PROGRESS - 1;
const ACTIVE_POLL_MS = 4_000;
const HIDDEN_POLL_MS = 20_000;
const MAX_POLL_MS = 30_000;

export type GenerationPhase =
  | "submitting"
  | "queued"
  | "creating"
  | "finalizing"
  | "reconnecting"
  | "complete";

export type GenerationProgressSnapshot = Readonly<{
  status: GenerationStatus;
  progress: number;
  isSubmitting?: boolean;
  connectionFailures?: number;
}>;

const TERMINAL_STATUSES: ReadonlySet<GenerationStatus> = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
  "timed_out",
]);

function isTerminal(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function mergeGenerationResponse(
  previous: GenerationResponse | undefined,
  response: GenerationResponse,
): GenerationResponse {
  if (!previous) {
    return response;
  }
  if (isTerminal(previous.status)) {
    return {
      ...previous,
      ...response,
      status: previous.status,
      progress: Math.max(previous.progress, response.progress),
      images: response.images.length > 0 ? response.images : previous.images,
    };
  }
  if (!isTerminal(response.status)) {
    return {
      ...response,
      status: previous.status === "processing" ? "processing" : response.status,
      progress: monotonicWorkingProgress(
        previous.progress,
        response.progress,
        FINALIZING_PROGRESS,
      ),
    };
  }
  return {
    ...response,
    progress: Math.max(previous.progress, response.progress),
  };
}

export function monotonicWorkingProgress(
  current: number,
  reported: number | undefined,
  ceiling: number,
): number {
  return Math.max(current, Math.min(reported ?? current, ceiling));
}

export function generationPhase(
  snapshot: GenerationProgressSnapshot,
): GenerationPhase {
  if (snapshot.isSubmitting) {
    return "submitting";
  }
  const stage = generationStagePhase(snapshot);
  if (stage === "complete") {
    return stage;
  }
  return (snapshot.connectionFailures ?? 0) >= 3 ? "reconnecting" : stage;
}

export function generationStagePhase(
  snapshot: GenerationProgressSnapshot,
): GenerationPhase {
  if (
    snapshot.status === "succeeded" ||
    snapshot.status === "partially_succeeded" ||
    snapshot.status === "failed" ||
    snapshot.status === "timed_out"
  ) {
    return "complete";
  }
  if (snapshot.status === "submitted") {
    return "queued";
  }
  return snapshot.progress >= FINALIZING_PROGRESS ? "finalizing" : "creating";
}

export function displayedProgress(
  snapshot: GenerationProgressSnapshot,
): number | null {
  if (
    snapshot.status === "succeeded" ||
    snapshot.status === "partially_succeeded"
  ) {
    return 100;
  }
  if (snapshot.progress <= 0) {
    return null;
  }
  return Math.min(snapshot.progress, FINALIZING_PROGRESS);
}

export function generationOverlayLabel(phase: GenerationPhase): string {
  if (phase === "complete") {
    return "";
  }
  if (phase === "reconnecting") {
    return "Reconnecting…";
  }
  const labels: Readonly<
    Record<Exclude<GenerationPhase, "reconnecting" | "complete">, string>
  > = {
    submitting: "Submitting…",
    queued: "Reading prompt…",
    creating: "Generating…",
    finalizing: "Loading poster…",
  };
  return labels[phase];
}

export function generationAction(
  isPro: boolean,
  isSubmitting: boolean,
  hasActiveGeneration: boolean,
): Readonly<{ label: string; disabled: boolean }> {
  if (isSubmitting) {
    return { label: "Sending...", disabled: true };
  }
  if (!hasActiveGeneration) {
    return { label: "Create poster", disabled: false };
  }
  return isPro
    ? { label: "Create another", disabled: false }
    : { label: "Current poster is generating", disabled: true };
}

export function generationPollDelay(
  failureCount: number,
  isPageHidden: boolean,
): number {
  const activeDelay = Math.min(
    ACTIVE_POLL_MS * 2 ** Math.max(0, failureCount),
    MAX_POLL_MS,
  );
  return isPageHidden ? Math.max(activeDelay, HIDDEN_POLL_MS) : activeDelay;
}
