"use client";

import ky, { HTTPError, TimeoutError } from "ky";
import {
  ArrowDownToLine,
  CircleAlert,
  LockKeyhole,
  Sparkles,
  X,
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
  IMAGE_COUNTS,
  type ImageCount,
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
  const [quality, setQuality] = useState<Quality>("low");
  // 默认 1 张；免费用户最大 2 张，Pro 可选 1-4 张
  const [imageCount, setImageCount] = useState<ImageCount>(1);
  const [generations, setGenerations] = useState<GenerationResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  // 多任务各自轮询，用 Set 统一管理计时器以便卸载时清理
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  function schedulePoll(id: string, delayMs: number): void {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      void poll(id);
    }, delayMs);
    timers.current.add(timer);
  }

  const selectedStyle = useMemo(() => styleLabels[style], [style]);

  // lightbox：Esc 关闭 + 锁定页面滚动
  useEffect(() => {
    if (!lightbox) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightbox]);

  useEffect(
    () => () => {
      for (const timer of timers.current) {
        clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  async function poll(id: string): Promise<void> {
    try {
      // GET 轻量：只查状态 + 图片，快速返回
      const raw: unknown = await ky
        .get(`/api/generations/${id}`, { timeout: 20_000 })
        .json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("The generation response was invalid.");
      }
      setGenerations((prev) =>
        prev.map((g) => (g.id === parsed.data.id ? parsed.data : g)),
      );
      if (["submitted", "processing"].includes(parsed.data.status)) {
        // 后台推进（重活：查 APIMart + 下载/水印/上传）。按 nextPollAt 到期触发，
        // 接口幂等（未到期立即返回）；超时静默——服务端会继续处理，下次轮询拿结果
        const next = parsed.data.nextPollAt
          ? new Date(parsed.data.nextPollAt).getTime()
          : 0;
        if (Date.now() >= next) {
          void ky
            .post(`/api/generations/${id}/advance`, { timeout: 120_000 })
            .catch(() => {});
        }
        schedulePoll(id, 4_000);
      } else if (
        parsed.data.status === "succeeded" ||
        parsed.data.status === "partially_succeeded"
      ) {
        track("generation_succeeded");
      } else {
        track("generation_failed");
      }
    } catch (pollError) {
      // 超时：服务端可能正在下载/水印/上传图片，静默继续轮询，不打扰用户
      if (pollError instanceof TimeoutError) {
        schedulePoll(id, 4_000);
        return;
      }
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
    // 按钮默认启用（对爬虫友好：HTML 中不显示 disabled），无输入时在提交前校验提示
    if (prompt.trim().length < 3) {
      setError("Describe the poster you want — a subject, mood, or line of copy.");
      return;
    }
    if (isSubmitting) {
      return;
    }
    if (!isPro && anyWorking) {
      setError("Wait for the current run to finish before starting another.");
      return;
    }
    setIsSubmitting(true);
    track("generation_started");
    try {
      const raw: unknown = await ky
        .post("/api/generations", {
          json: { prompt, style, aspectRatio, resolution, quality, imageCount },
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
      setGenerations((prev) => [
        { ...parsed.data, images: [], imageCount },
        ...prev,
      ]);
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

  // 免费用户同时只能一个生成任务；Pro 可并发多个
  const anyWorking = generations.some(
    (g) => g.status === "submitted" || g.status === "processing",
  );
  const isWorking = anyWorking;
  // 爬虫默认看到可点击的按钮（HTML 不写 disabled）；仅提交中禁用防重复
  const buttonDisabled = isSubmitting;

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
                  if (next === "low" || next === "medium" || next === "high") {
                    setQuality(next);
                  }
                }}
                disabled={isWorking || !isPro}
              >
                <option value="low">Low / fast</option>
                <option value="medium">Medium</option>
                <option value="high">High / precise</option>
              </select>
              {!isPro && <LockKeyhole size={14} aria-label="Pro only" />}
            </label>
            <label className="option-select">
              <span>Images</span>
              <select
                value={imageCount}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (IMAGE_COUNTS.some((count) => count === next)) {
                    setImageCount(next as ImageCount);
                  }
                }}
                disabled={isWorking}
              >
                {IMAGE_COUNTS.map((count) => (
                  <option
                    key={count}
                    value={count}
                    disabled={!isPro && count > 2}
                  >
                    {count} {count === 1 ? "poster" : "posters"}
                  </option>
                ))}
              </select>
              {!isPro && <LockKeyhole size={14} aria-label="Pro only" />}
            </label>
          </div>
          {!isPro && (
            <p className="pro-note">
              <LockKeyhole size={14} /> Free studio runs are 1K Low with a small
              watermark and up to two posters. Pro unlocks resolution, finish,
              up to four posters, and private history.
            </p>
          )}
          <p className="ai-disclosure">
            AI-generated content from GPT Image 2 via APIMart. Review accuracy,
            rights, and required labels before publishing.{" "}
            <a href="/ai-policy">Read the AI use policy.</a>
          </p>

          <button
            className="generate-button"
            type="button"
            onClick={() => void generate()}
            disabled={buttonDisabled}
          >
            <Sparkles size={18} />{" "}
            {isSubmitting ? "Generating..." : "Generate"}
          </button>
          {error && (
            <p className="error-message" role="alert">
              <CircleAlert size={16} /> {error}
            </p>
          )}
        </div>

        <div className="studio-results" aria-live="polite">
          {generations.length === 0 && (
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
          {generations.map((generation) => {
            const working =
              generation.status === "submitted" ||
              generation.status === "processing";
            return (
              <div className="generation-block" key={generation.id}>
                <div className="result-status">
                  <div>
                    <p className="eyebrow">
                      {STATUS_LABELS[generation.status]}
                    </p>
                    <p>
                      {working
                        ? "The studio is working through your brief."
                        : (generation.error ??
                          "Choose a direction to download.")}
                    </p>
                  </div>
                </div>
                {working && generation.images.length === 0 && (
                  <div className="result-grid result-grid--pending">
                    {Array.from({
                      length: generation.imageCount || imageCount,
                    }).map((_, index) => (
                      <div
                        className="result-card"
                        // biome-ignore lint/suspicious/noArrayIndexKey: 静态占位格子，无稳定 id
                        key={`pending-${index}`}
                        style={{ animationDelay: `${index * 140}ms` }}
                      >
                        <div className="result-number">0{index + 1}</div>
                        <div className="pending-tile" />
                        <div className="pending-caption">Rendering…</div>
                      </div>
                    ))}
                  </div>
                )}
                {generation.images.length > 0 && (
                  <div className="result-grid">
                    {generation.images.map((image, index) => (
                      <article className="result-card" key={image.id}>
                        <div className="result-number">0{index + 1}</div>
                        <button
                          type="button"
                          className="result-zoom"
                          onClick={() => setLightbox(image.url)}
                          aria-label={`View ${image.alt} full size`}
                        >
                          <Image
                            src={image.url}
                            alt={image.alt}
                            width={1024}
                            height={1280}
                            unoptimized
                          />
                        </button>
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
                {!working && generation.images.length === 0 && (
                  <div className="failure-card">
                    <CircleAlert size={22} />
                    <p>
                      Nothing was charged for this run. Try a shorter, more
                      visual brief.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setGenerations((prev) =>
                          prev.filter((g) => g.id !== generation.id),
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {generations.length > 0 && (
            <button
              className="reset-button"
              type="button"
              onClick={() => {
                setGenerations([]);
                setLightbox(null);
              }}
            >
              Start a new brief
            </button>
          )}
        </div>
      </div>
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full size preview"
          onClick={() => setLightbox(null)}
          onKeyUp={(event) => {
            if (event.key === "Escape") {
              setLightbox(null);
            }
          }}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          <Image
            src={lightbox}
            alt="Poster preview"
            width={1024}
            height={1280}
            unoptimized
            className="lightbox-image"
          />
        </div>
      )}
    </section>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
