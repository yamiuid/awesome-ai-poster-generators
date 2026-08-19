"use client";

import { ArrowDownToLine } from "lucide-react";
import Image from "next/image";
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

function creditLineText(generation: GenerationResponse): string {
  const { creditsReserved: reserved, creditsConsumed, status } = generation;
  if (status === "submitted" || status === "processing") {
    return `Reserving ${reserved} credits`;
  }
  if (status === "failed" || status === "timed_out") {
    return `Released ${reserved} credits`;
  }
  const consumed = creditsConsumed ?? reserved;
  const saved = reserved - consumed;
  return saved > 0
    ? `Used ${consumed} credits · ${saved} saved`
    : `Used ${consumed} credits`;
}

function PosterCard({
  index,
  image,
  aspectRatio,
  progressLabel,
  progress,
  onZoom,
  onDownload,
  onRetry,
}: Readonly<{
  index: number;
  image: GenerationImage | undefined;
  aspectRatio: AspectRatio;
  progressLabel: string;
  progress: number | null;
  onZoom: (url: string) => void;
  onDownload: (url: string, filename: string) => void;
  onRetry: () => void;
}>): JSX.Element {
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
    progressLabel || (imageIsLoading ? "Loading poster…" : "");
  const isPending = visibleProgressLabel.length > 0 || loadError;
  const announcesProgress = isPending && index === 0;
  return (
    <article className={`result-card ${isPending ? "is-pending" : ""}`}>
      <div className="result-number">0{index + 1}</div>
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
            aria-label={`View ${image.alt} full size`}
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
        {image && imageUrl && !isPending && loaded && (
          <a
            className="result-download-overlay"
            href={imageUrl}
            download={`text-to-poster-${index + 1}.png`}
            onClick={(event) => {
              event.preventDefault();
              onDownload(imageUrl, `text-to-poster-${index + 1}.png`);
            }}
            aria-label={`Download ${image.alt}`}
          >
            <ArrowDownToLine size={18} aria-hidden="true" />
          </a>
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
            aria-label="Couldn’t load poster. Retry"
          >
            Couldn’t load poster. Retry
          </button>
        ) : announcesProgress ? (
          <span
            className="result-progress-overlay"
            role="progressbar"
            aria-label="Poster generation progress"
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
  onDownload,
  onRetry,
}: Readonly<{
  generation: GenerationResponse;
  isGuest: boolean;
  isSubmitting?: boolean;
  connectionFailures?: number;
  onZoom: (url: string) => void;
  onDownload: (url: string, filename: string) => void;
  onRetry: (generationId: string) => void;
}>): JSX.Element {
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
            onDownload={onDownload}
            onRetry={() => onRetry(generation.id)}
          />
        ))}
      </div>

      {phase === "complete" && generation.creditsReserved > 0 && (
        <p className="credit-line generation-credit-line">
          {creditLineText(generation)}
        </p>
      )}
    </div>
  );
}
