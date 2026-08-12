"use client";

import ky, { HTTPError, TimeoutError } from "ky";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleAlert,
  LockKeyhole,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { batchCreditCost } from "@/lib/domain/credits";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  aspectLabels,
  type GenerationImage,
  type GenerationResponse,
  generationAcceptedSchema,
  generationResponseSchema,
  IMAGE_COUNTS,
  type ImageCount,
  isResolution,
  type PosterStyle,
  type Quality,
  type Resolution,
  styleLabels,
} from "@/lib/domain/poster";
import {
  POSTER_EXAMPLES,
  type PosterExample,
} from "@/lib/domain/poster-examples";
import { ArtDirectionPicker } from "./art-direction-picker";

type Props = Readonly<{ isPro: boolean }>;

const FEATURED_EXAMPLE_STYLES: PosterStyle[] = [
  "movie",
  "minimal",
  "vintage",
  "neon",
];

const STATUS_LABELS: Readonly<Record<GenerationResponse["status"], string>> = {
  submitted: "Sending to the studio",
  processing: "Painting your directions",
  succeeded: "Your posters are ready",
  partially_succeeded: "Most posters ready",
  failed: "Generation stopped",
  timed_out: "Generation timed out",
};

// 生成块的积分消耗文案：
// - 进行中 → Reserving N；完成 → Used N（部分成功追加 K saved）；失败 → Released N
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

// 免费档位：1K / low / 最多 2 张；免费用户选了更高档位才显示锁，
// 点击 Generate 时提示升级，不发起请求
const FREE_RESOLUTION: Resolution = "1k";
const FREE_QUALITY: Quality = "low";
const FREE_MAX_IMAGES = 2;

type TierOption = Readonly<{ value: string; label: string; locked: boolean }>;

/**
 * 原生 select 的替代：自定义 listbox，避免系统控件样式与站点风格脱节。
 * 付费选项（locked）在行尾渲染线性 LockKeyhole 图标。支持键盘导航与点击外部关闭。
 */
function TierSelect({
  value,
  options,
  onChange,
  disabled = false,
  label,
}: Readonly<{
  value: string;
  options: readonly TierOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIndex = useMemo(
    () =>
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    [options, value],
  );
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const selectedLabel = selectedOption?.label ?? "";

  function openMenu(): void {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function selectAt(index: number): void {
    const option = options[index];
    if (!option) {
      return;
    }
    onChange(option.value);
    setOpen(false);
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 关闭时把高亮重置回当前选中项
  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex);
    }
  }, [open, selectedIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) {
          setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        } else {
          openMenu();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) {
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else {
          openMenu();
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) {
          selectAt(activeIndex);
        } else {
          openMenu();
        }
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="option-control-wrap" ref={containerRef}>
      <button
        type="button"
        className="option-control"
        role="combobox"
        aria-expanded={open}
        aria-controls={`option-${label}-listbox`}
        aria-activedescendant={
          open ? `option-${label}-${activeIndex}` : undefined
        }
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
      >
        <span className="option-control-label">
          <span className="option-control-text">{selectedLabel}</span>
          {selectedOption?.locked && (
            <LockKeyhole size={13} className="option-lock" aria-hidden="true" />
          )}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`option-${label}-listbox`}
          className="option-menu"
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              id={`option-${label}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`option-item ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => selectAt(index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="option-item-label">
                {option.label}
                {option.locked && (
                  <LockKeyhole
                    size={13}
                    className="option-lock"
                    aria-hidden="true"
                  />
                )}
              </span>
              {option.value === value && (
                <Check size={13} className="option-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function track(name: string): void {
  window.umami?.track(name);
}

/**
 * 单张结果卡：媒体槽内骨架层常驻底层，图片加载完成后淡入覆盖，
 * 卡片 DOM 从占位到成品全程不变，避免替换抖动。
 */
function PosterCard({
  index,
  image,
  onZoom,
}: Readonly<{
  index: number;
  image: GenerationImage | undefined;
  onZoom: (url: string) => void;
}>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <article className="result-card">
      <div className="result-number">0{index + 1}</div>
      <div className="result-media">
        <div className="result-media-skeleton" aria-hidden="true" />
        {image && (
          <button
            type="button"
            className="result-zoom"
            onClick={() => onZoom(image.url)}
            aria-label={`View ${image.alt} full size`}
          >
            <Image
              src={image.url}
              alt={image.alt}
              width={1024}
              height={1280}
              unoptimized
              className={
                loaded ? "result-media-image is-loaded" : "result-media-image"
              }
              onLoad={() => setLoaded(true)}
            />
          </button>
        )}
      </div>
      <div className="result-actions">
        {image ? (
          <a
            className="download-link"
            href={image.url}
            download={`text-to-poster-${index + 1}.png`}
            onClick={() => track("download_completed")}
          >
            <ArrowDownToLine size={15} /> Download
          </a>
        ) : (
          <p className="pending-caption">Rendering…</p>
        )}
        {image?.watermarked && (
          <span className="watermark-note">Free preview</span>
        )}
      </div>
    </article>
  );
}

export function PosterStudio({ isPro }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<PosterStyle>("auto");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [resolution, setResolution] = useState<Resolution>("1k");
  const [quality, setQuality] = useState<Quality>("low");
  // 默认 1 张；免费用户最大 2 张，Pro 可选 1-4 张
  const [imageCount, setImageCount] = useState<ImageCount>(1);
  const [generations, setGenerations] = useState<GenerationResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 免费用户选了 Pro 档位后点击 Generate 的升级提示
  const [upgradePrompt, setUpgradePrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 乐观占位：点击 Generate 瞬间在结果区显示渲染骨架，POST 返回前不让用户盯着空白
  const [pendingPlaceholder, setPendingPlaceholder] = useState(false);
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
  const featuredExamples = useMemo(
    () =>
      FEATURED_EXAMPLE_STYLES.map((featuredStyle) =>
        POSTER_EXAMPLES.find((example) => example.style === featuredStyle),
      ).filter((example): example is PosterExample => example !== undefined),
    [],
  );

  function chooseExample(example: PosterExample): void {
    setPrompt(example.prompt);
    setStyle(example.style);
  }

  // lightbox：Esc 关闭 + 锁定页面滚动
  useEffect(() => {
    if (!lightbox) {
      return;
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
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
    setUpgradePrompt(false);
    // 按钮默认启用（对爬虫友好：HTML 中不显示 disabled），无输入时在提交前校验提示
    if (prompt.trim().length < 3) {
      setError(
        "Describe the poster you want — a subject, mood, or line of copy.",
      );
      return;
    }
    // 免费用户选了 Pro 档位：不发起请求，引导开通会员
    if (!isPro && needsPro) {
      setUpgradePrompt(true);
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
    setPendingPlaceholder(true);
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
      setPendingPlaceholder(false);
      setGenerations((prev) => [
        { ...parsed.data, images: [], imageCount },
        ...prev,
      ]);
      void poll(parsed.data.id);
    } catch (submitError) {
      setPendingPlaceholder(false);
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
  // 免费用户选了 Pro 档位（非 1K / 非 low / 超过 2 张）时，点击 Generate 提示升级
  const needsPro =
    !isPro &&
    (resolution !== FREE_RESOLUTION ||
      quality !== FREE_QUALITY ||
      imageCount > FREE_MAX_IMAGES);
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
        <span className="studio-count">Multiple directions / one brief</span>
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
            <ArtDirectionPicker
              value={style}
              onChange={setStyle}
              disabled={isWorking}
            />
          </fieldset>

          <fieldset className="control-block">
            <legend className="field-label">Output settings</legend>
            <div className="studio-options">
              <div className="option-select">
                <span>Aspect Ratio</span>
                <TierSelect
                  label="Aspect Ratio"
                  value={aspectRatio}
                  onChange={(next) => {
                    if (ASPECT_RATIOS.some((option) => option === next)) {
                      setAspectRatio(next as AspectRatio);
                      setUpgradePrompt(false);
                    }
                  }}
                  disabled={isWorking}
                  options={ASPECT_RATIOS.map((option) => ({
                    value: option,
                    label: `${aspectLabels[option]} (${option})`,
                    locked: false,
                  }))}
                />
              </div>
              <div className="option-select">
                <span>Resolution</span>
                <TierSelect
                  label="Resolution"
                  value={resolution}
                  onChange={(next) => {
                    if (isResolution(next)) {
                      setResolution(next);
                      setUpgradePrompt(false);
                    }
                  }}
                  disabled={isWorking}
                  options={[
                    { value: "1k", label: "1K", locked: false },
                    { value: "2k", label: "2K / crisp", locked: !isPro },
                    { value: "4k", label: "4K / print", locked: !isPro },
                  ]}
                />
              </div>
              <div className="option-select">
                <span>Quality</span>
                <TierSelect
                  label="Quality"
                  value={quality}
                  onChange={(next) => {
                    if (
                      next === "low" ||
                      next === "medium" ||
                      next === "high"
                    ) {
                      setQuality(next);
                      setUpgradePrompt(false);
                    }
                  }}
                  disabled={isWorking}
                  options={[
                    { value: "low", label: "Low / fast", locked: false },
                    { value: "medium", label: "Medium", locked: !isPro },
                    { value: "high", label: "High / precise", locked: !isPro },
                  ]}
                />
              </div>
              <div className="option-select">
                <span>Images</span>
                <TierSelect
                  label="Images"
                  value={String(imageCount)}
                  onChange={(next) => {
                    const count = Number(next);
                    if (IMAGE_COUNTS.some((candidate) => candidate === count)) {
                      setImageCount(count as ImageCount);
                      setUpgradePrompt(false);
                    }
                  }}
                  disabled={isWorking}
                  options={IMAGE_COUNTS.map((count) => ({
                    value: String(count),
                    label: `${count} ${count === 1 ? "poster" : "posters"}`,
                    locked: !isPro && count > FREE_MAX_IMAGES,
                  }))}
                />
              </div>
            </div>
          </fieldset>
          {isPro && (
            <p className="credit-estimate">
              This run uses{" "}
              <strong>
                {batchCreditCost(resolution, quality, aspectRatio, imageCount)}
              </strong>{" "}
              credits
            </p>
          )}
          {!isPro && (
            <p className="pro-note">
              <LockKeyhole size={14} /> Free runs are 1K, watermarked, up to 2
              posters. Pro unlocks full quality and 4 posters.
            </p>
          )}

          <button
            className="generate-button"
            type="button"
            onClick={() => void generate()}
            disabled={buttonDisabled}
          >
            <Sparkles size={18} /> {isSubmitting ? "Generating..." : "Generate"}
          </button>
          <p className="ai-disclosure">
            AI-generated with GPT Image 2.{" "}
            <a href="/ai-policy">Read the AI use policy.</a>
          </p>
          {upgradePrompt ? (
            <p className="error-message" role="alert">
              <CircleAlert size={16} />
              <span>
                These options are Pro only.{" "}
                <a className="error-link" href="/pricing">
                  Upgrade to Pro
                </a>{" "}
                to unlock 2K/4K, higher finish, and up to 4 posters.
              </span>
            </p>
          ) : (
            error && (
              <p className="error-message" role="alert">
                <CircleAlert size={16} /> {error}
              </p>
            )
          )}
        </div>

        <div className="studio-results" aria-live="polite">
          {generations.length === 0 && !pendingPlaceholder && (
            <div className="empty-studio">
              <fieldset
                className="empty-preview-grid"
                aria-label="Example poster outputs"
              >
                {featuredExamples.map((example, index) => (
                  <button
                    className="empty-preview"
                    key={example.style}
                    type="button"
                    onClick={() => chooseExample(example)}
                    aria-label={`Use the ${example.label} example brief`}
                  >
                    <Image
                      src={example.image}
                      alt=""
                      width={1024}
                      height={1280}
                      sizes="(max-width: 520px) 45vw, 20vw"
                    />
                    <span>
                      {String(index + 1).padStart(2, "0")} / {example.label}
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="empty-copy">
                <span className="empty-mark">01</span>
                <div>
                  <p>
                    Multiple readings of the same idea. Start with a feeling, a
                    place, or a line of copy.
                  </p>
                  <div className="example-list">
                    {featuredExamples.map((example) => (
                      <button
                        key={`${example.style}-prompt`}
                        type="button"
                        onClick={() => chooseExample(example)}
                      >
                        {example.prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {pendingPlaceholder && (
            <div className="generation-block">
              <div className="result-status">
                <div>
                  <p className="eyebrow">Sending to the studio</p>
                  <p>The studio is working through your brief.</p>
                </div>
              </div>
              <div className="result-grid">
                {Array.from({ length: imageCount }).map((_, index) => (
                  <PosterCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 静态占位格子，无稳定 id
                    key={`placeholder-${index}`}
                    index={index}
                    image={undefined}
                    onZoom={(url) => setLightbox(url)}
                  />
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
                    {generation.creditsReserved > 0 && (
                      <p className="credit-line">
                        {creditLineText(generation)}
                      </p>
                    )}
                  </div>
                </div>
                {(working || generation.images.length > 0) && (
                  <div className="result-grid">
                    {Array.from({
                      length: generation.imageCount || imageCount,
                    }).map((_, index) => (
                      <PosterCard
                        // biome-ignore lint/suspicious/noArrayIndexKey: 静态槽位，图片按 index 对齐
                        key={`slot-${index}`}
                        index={index}
                        image={generation.images[index]}
                        onZoom={(url) => setLightbox(url)}
                      />
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
