"use client";

import ky, { HTTPError } from "ky";
import {
  ArrowDownToLine,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  aspectLabels,
  type GenerationResponse,
  generationAcceptedSchema,
  generationResponseSchema,
  isResolution,
  type PosterStyle,
  type Quality,
  type Resolution,
  STYLES,
  styleLabels,
} from "@/lib/domain/poster";

type Props = Readonly<{ isPro: boolean }>;

const EXAMPLES = [
  "A midnight jazz festival in a rain-soaked city, copper type, quiet luxury",
  "Community garden open day, bold hand-painted lettering, optimistic summer light",
  "Independent film premiere, a lone figure under a red moon, art-house tension",
] as const;

const STATUS_LABELS: Readonly<Record<GenerationResponse["status"], string>> = {
  submitted: "Sending to the studio",
  processing: "Painting four directions",
  succeeded: "Four posters ready",
  partially_succeeded: "Most posters ready",
  failed: "Generation stopped",
  timed_out: "Generation timed out",
};

function track(name: string): void {
  window.umami?.track(name);
}

export function PosterStudio({ isPro }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<PosterStyle>("movie");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [resolution, setResolution] = useState<Resolution>("1k");
  const [quality, setQuality] = useState<Quality>("medium");
  const [generation, setGeneration] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedStyle = useMemo(() => styleLabels[style], [style]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  async function poll(id: string): Promise<void> {
    try {
      const raw: unknown = await ky.get(`/api/generations/${id}`).json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("The generation response was invalid.");
      }
      setGeneration(parsed.data);
      if (["submitted", "processing"].includes(parsed.data.status)) {
        timer.current = setTimeout(() => void poll(id), 4_000);
      } else if (
        parsed.data.status === "succeeded" ||
        parsed.data.status === "partially_succeeded"
      ) {
        track("generation_succeeded");
      } else {
        track("generation_failed");
      }
    } catch (pollError) {
      if (pollError instanceof HTTPError) {
        setError("We could not check the studio status. Please try again.");
      } else if (pollError instanceof Error) {
        setError(pollError.message);
      } else {
        setError("We could not check the studio status. Please try again.");
      }
    }
  }

  async function generate(): Promise<void> {
    setError(null);
    setGeneration(null);
    setIsSubmitting(true);
    track("generation_started");
    try {
      const raw: unknown = await ky
        .post("/api/generations", {
          json: { prompt, style, aspectRatio, resolution, quality },
          timeout: 30_000,
        })
        .json();
      const parsed = generationAcceptedSchema.safeParse(raw);
      if (!parsed.success) {
        const message =
          typeof raw === "object" &&
          raw !== null &&
          "error" in raw &&
          typeof raw.error === "string"
            ? raw.error
            : "We could not start this generation.";
        throw new Error(message);
      }
      setGeneration({ ...parsed.data, images: [] });
      void poll(parsed.data.id);
    } catch (submitError) {
      if (submitError instanceof HTTPError) {
        const body: unknown = submitError.data;
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "We could not start this generation.";
        setError(message);
      } else if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError("We could not start this generation.");
      }
      track("generation_failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canGenerate = prompt.trim().length >= 3 && !isSubmitting && !generation;
  const isWorking =
    generation?.status === "submitted" || generation?.status === "processing";

  return (
    <section
      className="studio-shell"
      id="studio"
      aria-labelledby="studio-heading"
    >
      <div className="studio-header">
        <div>
          <p className="eyebrow">The poster studio</p>
          <h2 id="studio-heading">Give the idea a shape.</h2>
        </div>
        <span className="studio-count">4 directions / one brief</span>
      </div>

      <div className="studio-grid">
        <div className="studio-controls">
          <label className="field-label" htmlFor="poster-prompt">
            Describe your poster idea
          </label>
          <textarea
            id="poster-prompt"
            className="prompt-field"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="A summer music festival with neon lights..."
            maxLength={1500}
            rows={5}
            disabled={isWorking}
          />
          <div className="field-hint">
            <span>Be specific about mood, subject, and words.</span>
            <span>{prompt.length}/1500</span>
          </div>

          <fieldset className="control-block">
            <div className="control-heading">
              <legend className="field-label">Art direction</legend>
              <span>{selectedStyle}</span>
            </div>
            <div className="chip-grid">
              {STYLES.map((option) => (
                <button
                  key={option}
                  className={`choice-chip ${style === option ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setStyle(option)}
                  disabled={isWorking}
                  aria-pressed={style === option}
                >
                  {styleLabels[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-block">
            <legend className="field-label">Format</legend>
            <div className="segmented-control">
              {ASPECT_RATIOS.map((option) => (
                <button
                  key={option}
                  className={aspectRatio === option ? "is-active" : ""}
                  type="button"
                  onClick={() => setAspectRatio(option)}
                  disabled={isWorking}
                  aria-pressed={aspectRatio === option}
                >
                  {aspectLabels[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="studio-options">
            <label className="option-select">
              <span>Resolution</span>
              <select
                value={resolution}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isResolution(next)) setResolution(next);
                }}
                disabled={isWorking || !isPro}
              >
                <option value="1k">1K / everyday</option>
                <option value="2k">2K / crisp</option>
                <option value="4k">4K / print</option>
              </select>
              {!isPro && <LockKeyhole size={14} aria-label="Pro only" />}
            </label>
            <label className="option-select">
              <span>Finish</span>
              <select
                value={quality}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "medium" || next === "high") setQuality(next);
                }}
                disabled={isWorking || !isPro}
              >
                <option value="medium">Medium</option>
                <option value="high">High / precise</option>
              </select>
              {!isPro && <LockKeyhole size={14} aria-label="Pro only" />}
            </label>
          </div>
          {!isPro && (
            <p className="pro-note">
              <LockKeyhole size={14} /> Free studio runs are 1K Low with a small
              watermark. Pro unlocks resolution, finish, and private history.
            </p>
          )}
          <p className="ai-disclosure">
            AI-generated content. Review accuracy, rights, and required labels
            before publishing. <a href="/ai-policy">Read the AI use policy.</a>
          </p>

          <button
            className="generate-button"
            type="button"
            onClick={() => void generate()}
            disabled={!canGenerate}
          >
            <Sparkles size={18} />{" "}
            {isSubmitting ? "Preparing the studio..." : "Generate four posters"}
          </button>
          {error && (
            <p className="error-message" role="alert">
              <CircleAlert size={16} /> {error}
            </p>
          )}
        </div>

        <div className="studio-results" aria-live="polite">
          {!generation && (
            <div className="empty-studio">
              <span className="empty-mark">01</span>
              <p>
                Four different readings of the same idea. Start with a feeling,
                a place, or a line of copy.
              </p>
              <div className="example-list">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {generation && (
            <>
              <div className="result-status">
                <div>
                  <p className="eyebrow">{STATUS_LABELS[generation.status]}</p>
                  <p>
                    {isWorking
                      ? "The studio is working through your brief."
                      : (generation.error ?? "Choose a direction to download.")}
                  </p>
                </div>
                {isWorking && (
                  <LoaderCircle
                    className="spin"
                    size={22}
                    aria-label="Loading"
                  />
                )}
              </div>
              {isWorking && (
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`${generation.progress}% complete`}
                  aria-valuenow={generation.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span
                    style={{ width: `${Math.max(6, generation.progress)}%` }}
                  />
                </div>
              )}
              {generation.images.length > 0 && (
                <div className="result-grid">
                  {generation.images.map((image, index) => (
                    <article className="result-card" key={image.id}>
                      <div className="result-number">0{index + 1}</div>
                      <Image
                        src={image.url}
                        alt={image.alt}
                        width={1024}
                        height={1280}
                        unoptimized
                      />
                      <a
                        className="download-link"
                        href={image.url}
                        download={`text-to-poster-${index + 1}.png`}
                        onClick={() => track("download_completed")}
                      >
                        <ArrowDownToLine size={15} /> Download
                      </a>
                      {image.watermarked && (
                        <span className="watermark-note">Free preview</span>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {!isWorking && generation.images.length === 0 && (
                <div className="failure-card">
                  <CircleAlert size={22} />
                  <p>
                    Nothing was charged for this run. Try a shorter, more visual
                    brief.
                  </p>
                  <button type="button" onClick={() => setGeneration(null)}>
                    Try another brief
                  </button>
                </div>
              )}
              {!isWorking && (
                <button
                  className="reset-button"
                  type="button"
                  onClick={() => setGeneration(null)}
                >
                  Start a new brief
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
