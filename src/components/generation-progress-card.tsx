"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type JSX, useEffect, useState } from "react";
import {
  displayedProgress,
  generationOverlayLabel,
  generationPhase,
} from "@/lib/domain/generation-progress";
import type {
  AspectRatio,
  GenerationImage,
  GenerationResponse,
} from "@/lib/domain/poster";

const POSTER_SLOTS = [0, 1, 2, 3] as const;

type Translator = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

function creditLineText(generation: GenerationResponse, t: Translator): string {
  const { creditsReserved: reserved, creditsConsumed, status } = generation;
  if (status === "submitted" || status === "processing") {
    return t("reserving", { credits: reserved });
  }
  if (status === "failed" || status === "timed_out") {
    return t("released", { credits: reserved });
  }
  const consumed = creditsConsumed ?? reserved;
  const saved = reserved - consumed;
  return saved > 0
    ? t("usedSaved", { used: consumed, saved })
    : t("used", { credits: consumed });
}

function PosterCard({
  index,
  image,
  aspectRatio,
  progressLabel,
  progress,
  onZoom,
  onRetry,
}: Readonly<{
  index: number;
  image: GenerationImage | undefined;
  aspectRatio: AspectRatio;
  progressLabel: string;
  progress: number | null;
  onZoom: (url: string) => void;
  onRetry: () => void;
}>): JSX.Element {
  const t = useTranslations("account");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const imageUrl = image?.url;
  useEffect(() => {
    setLoaded(false);
    setLoadError(false);
    if (!imageUrl) {
      return;
    }
  }, [imageUrl]);
  const imageIsLoading = Boolean(imageUrl) && !loaded && !loadError;
  const visibleProgressLabel =
    progressLabel || (imageIsLoading ? t("loadingPoster") : "");
  const isPending = visibleProgressLabel.length > 0 || loadError;
  const announcesProgress = isPending && index === 0;
  return (
    <article className={`result-card ${isPending ? "is-pending" : ""}`}>
      <div
        className="result-media"
        style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
      >
        <div className="result-media-skeleton" aria-hidden="true" />
        {image && imageUrl && (
          <button
            type="button"
            className="result-zoom"
            onClick={() => onZoom(image.url)}
            aria-label={`${t("fullSizePreview")}: ${image.alt}`}
          >
            <Image
              src={imageUrl}
              alt={image.alt}
              width={1024}
              height={1280}
              style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
              className={
                loaded ? "result-media-image is-loaded" : "result-media-image"
              }
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(false);
                setLoadError(true);
              }}
            />
          </button>
        )}
        {loadError ? (
          <button
            type="button"
            className="result-progress-overlay result-retry-overlay"
            onClick={() => {
              setLoadError(false);
              setLoaded(false);
              onRetry();
            }}
            aria-label={t("retryPoster")}
          >
            {t("retryPoster")}
          </button>
        ) : announcesProgress ? (
          <span
            className="result-progress-overlay"
            role="progressbar"
            aria-label={t("generationProgress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressLabel ? (progress ?? undefined) : undefined}
            aria-valuetext={visibleProgressLabel}
          >
            {visibleProgressLabel}
          </span>
        ) : (
          isPending && (
            <span className="result-progress-overlay" aria-hidden="true">
              {visibleProgressLabel}
            </span>
          )
        )}
      </div>
    </article>
  );
}

export function GenerationProgressCard({
  generation,
  isSubmitting = false,
  connectionFailures = 0,
  onZoom,
  onRetry,
}: Readonly<{
  generation: GenerationResponse;
  isGuest: boolean;
  isSubmitting?: boolean;
  connectionFailures?: number;
  onZoom: (url: string) => void;
  onRetry: (generationId: string) => void;
}>): JSX.Element {
  const t = useTranslations("account");
  const snapshot = {
    status: generation.status,
    progress: generation.progress,
    isSubmitting,
    connectionFailures,
  } as const;
  const phase = generationPhase(snapshot);
  const progress = displayedProgress(snapshot);
  const progressLabel = generationOverlayLabel(phase);
  const visibleImageCount =
    phase === "complete" ? generation.images.length : generation.imageCount;

  return (
    <div
      className="generation-progress-card"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="result-grid">
        {POSTER_SLOTS.slice(0, visibleImageCount).map((slot) => (
          <PosterCard
            key={`slot-${slot}`}
            index={slot}
            image={generation.images[slot]}
            aspectRatio={generation.aspectRatio}
            progressLabel={progressLabel}
            progress={progress}
            onZoom={onZoom}
            onRetry={() => onRetry(generation.id)}
          />
        ))}
      </div>

      {phase === "complete" && generation.creditsReserved > 0 && (
        <p className="credit-line generation-credit-line">
          {creditLineText(generation, t)}
        </p>
      )}
    </div>
  );
}
