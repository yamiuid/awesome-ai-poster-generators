import type { GenerationResponse, GenerationStatus } from "./poster";

export const FINALIZING_PROGRESS = 95;
export const PROVIDER_PROGRESS_CEILING = FINALIZING_PROGRESS - 1;
const ACTIVE_POLL_MS = 4_000;
const HIDDEN_POLL_MS = 20_000;
const MAX_POLL_MS = 30_000;
const SERVER_POLL_BASE_MS = 4_000;
const SERVER_POLL_MAX_MS = 60_000;

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
    // 本地已终态时，服务端只有「把失败/超时补完为成功」才允许翻盘：
    // 卡住的任务可能被 cron 在服务端恢复（下载 + 水印 + 上传都做完），
    // 此时必须采纳服务端的状态，否则列表会一直挂着那条没有图片的失败记录。
    // 反向（服务端 failed / 本地 succeeded）不翻盘。
    if (
      isFailureTerminal(previous.status) &&
      isSuccessTerminal(response.status)
    ) {
      return {
        ...response,
        progress: Math.max(previous.progress, response.progress),
      };
    }
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

export function generationFailureMessage(
  snapshot: Pick<GenerationResponse, "status" | "error">,
): string {
  const detail = snapshot.error?.trim();
  if (detail) {
    return detail;
  }
  return snapshot.status === "timed_out"
    ? "The image service did not respond; your credits were returned."
    : "Nothing was charged for this run. Try a shorter, more visual brief.";
}

export function generationFailureStatus(
  source: "provider_poll" | "finalization",
  failures: number,
  maxFailures: number,
): "retry" | "failed" | "timed_out" {
  if (failures < maxFailures) {
    return "retry";
  }
  return source === "finalization" ? "failed" : "timed_out";
}

function isFailureTerminal(status: GenerationResponse["status"]): boolean {
  return status === "failed" || status === "timed_out";
}

function isSuccessTerminal(status: GenerationResponse["status"]): boolean {
  return status === "succeeded" || status === "partially_succeeded";
}

/**
 * 服务端推进失败后的重试间隔：4s、8s、16s、32s，之后封顶 60s。
 * 退避是为了让「对方抖一下」不至于在几十秒内就把仍在出图的任务判死。
 */
export function serverPollBackoffMs(failures: number): number {
  return Math.min(
    SERVER_POLL_BASE_MS * 2 ** Math.max(0, failures),
    SERVER_POLL_MAX_MS,
  );
}

export type GenerationFailureMessageKey =
  | "providerContentRejected"
  | "providerTimeout"
  | "safetyReviewFailed";

/**
 * 把失败归因码映射到本地化文案 key；没有映射时返回 null，
 * 由调用方回退到服务端返回的原始错误信息。
 */
export function generationFailureMessageKey(
  snapshot: Pick<GenerationResponse, "errorCode">,
): GenerationFailureMessageKey | null {
  switch (snapshot.errorCode) {
    case "PROVIDER_CONTENT_POLICY":
      return "providerContentRejected";
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_UNRESPONSIVE":
    case "GENERATION_TIMEOUT":
      return "providerTimeout";
    case "PROMPT_SAFETY_BLOCKED":
    case "PROMPT_SAFETY_REVIEW_REQUIRED":
    case "PROMPT_SAFETY_UNAVAILABLE":
      return "safetyReviewFailed";
    default:
      return null;
  }
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
