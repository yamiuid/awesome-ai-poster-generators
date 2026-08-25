"use client";

import ky, { HTTPError, TimeoutError } from "ky";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  History,
  Images,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  type ClipboardEvent,
  type JSX,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BRIEF_CHAR_LIMITS,
  type BriefFields,
  buildBriefPrompt,
} from "@/lib/domain/brief";
import { batchCreditCost } from "@/lib/domain/credits";
import {
  flattenRecentPosterImages,
  isVisibleGuestHistory,
} from "@/lib/domain/generation-history";
import {
  generationAction,
  generationFailureMessage,
  generationPollDelay,
  mergeGenerationResponse,
} from "@/lib/domain/generation-progress";
import { detectInputType, type InputType } from "@/lib/domain/input-intent";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  aspectLabels,
  type GenerationResponse,
  generationAcceptedSchema,
  generationCreatedSchema,
  generationResponseSchema,
  IMAGE_COUNTS,
  type ImageCount,
  type PosterStyle,
  QUALITIES,
  type Quality,
  RESOLUTIONS,
  type Resolution,
  recentGenerationsSchema,
  STYLES,
  styleLabels,
} from "@/lib/domain/poster";
import { LoginForm } from "./login-form";
import { UrlPipelineModal } from "./url-pipeline-modal";

export type PosterStudioExample = Readonly<{
  id?: string;
  label: string;
  prompt: string;
  image: string;
  alt: string;
  width?: number;
  height?: number;
}>;

type Props = Readonly<{
  isPro: boolean;
  isGuest: boolean;
  initialStyle?: PosterStyle;
  examples?: readonly PosterStudioExample[];
}>;

const STUDIO_JOB_EXAMPLES: readonly PosterStudioExample[] = [
  {
    id: "event",
    label: "Event poster",
    prompt:
      "Summer jazz festival in Los Angeles, August 28 — one night, three stages, get tickets before they sell out.",
    image: "/examples/neon-after-dark.webp",
    alt: "An example event poster with neon nightlife art.",
  },
  {
    id: "article",
    label: "Article → Poster",
    prompt: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    image: "/examples/minimal-form-field.webp",
    alt: "An example article poster with editorial minimal art.",
  },
  {
    id: "announcement",
    label: "Announcement → Poster",
    prompt:
      "We are excited to announce TextToPoster 2.0 — smarter layouts, faster generation, and full quality controls for every creator.",
    image: "/examples/business-next-shift.webp",
    alt: "An example announcement poster with a confident business look.",
  },
];

// 免费档位：1K / low / 最多 2 张；免费用户选了更高档位才显示锁，
// 点击 Generate 时提示升级，不发起请求
const FREE_RESOLUTION: Resolution = "1k";
const FREE_QUALITY: Quality = "low";
const FREE_MAX_IMAGES = 2;
const GUEST_MAX_IMAGES = 1;

const EMPTY_BRIEF_FIELDS: BriefFields = {
  headline: "",
  subtitle: "",
  points: ["", "", ""],
  cta: "",
};

type GenerationParams = Readonly<{
  style: PosterStyle;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  quality: Quality;
  imageCount: ImageCount;
  inputType: InputType;
  referenceImageUrl?: string;
}>;

type GenerateOverrides = Readonly<{
  prompt?: string;
  inputType?: InputType;
  referenceImageUrl?: string;
  style?: PosterStyle;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  quality?: Quality;
  imageCount?: ImageCount;
}>;

function deriveFieldsFromPrompt(promptText: string): BriefFields {
  const lines = promptText
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headline = lines[0]?.slice(0, BRIEF_CHAR_LIMITS.headline) ?? "";
  const subtitle = lines[1]?.slice(0, BRIEF_CHAR_LIMITS.subtitle) ?? "";
  const points = lines
    .slice(2, 2 + 3)
    .map((line) => line.slice(0, BRIEF_CHAR_LIMITS.point));
  while (points.length < 3) {
    points.push("");
  }
  return { headline, subtitle, points, cta: "" };
}

function BriefPointInput({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
}>): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      maxLength={BRIEF_CHAR_LIMITS.point}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

type TierOption = Readonly<{ value: string; label: string; locked: boolean }>;

/**
 * 原生 select 的替代：自定义 listbox，避免系统控件样式与站点风格脱节。
 * 付费选项（locked）可以正常选中，行尾渲染线性 LockKeyhole 图标提示升级；
 * 免费用户点击 Generate 时再由业务层弹窗引导升级。支持键盘导航与点击外部关闭。
 */
function TierSelect({
  value,
  options,
  onChange,
  disabled = false,
  label,
  menuClassName,
  gridColumns,
}: Readonly<{
  value: string;
  options: readonly TierOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  menuClassName?: string;
  gridColumns?: number;
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
          setActiveIndex((index) =>
            Math.min(index + (gridColumns ?? 1), options.length - 1),
          );
        } else {
          openMenu();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) {
          setActiveIndex((index) => Math.max(index - (gridColumns ?? 1), 0));
        } else {
          openMenu();
        }
        break;
      case "ArrowLeft":
        if (open && gridColumns) {
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
        }
        break;
      case "ArrowRight":
        if (open && gridColumns) {
          event.preventDefault();
          setActiveIndex((index) => Math.min(index + 1, options.length - 1));
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
        <ChevronDown size={14} className="option-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`option-${label}-listbox`}
          className={`option-menu ${menuClassName ?? ""}`.trim()}
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

type OutputGroup = "aspect" | "resolution" | "quality";

type OutputOption = Readonly<{
  group: OutputGroup;
  value: string;
  label: string;
  locked: boolean;
  selected: boolean;
}>;

const RESOLUTION_LABELS: Readonly<Record<Resolution, string>> = {
  "1k": "1K",
  "2k": "2K / crisp",
  "4k": "4K / print",
};

const QUALITY_LABELS: Readonly<Record<Quality, string>> = {
  low: "Low / fast",
  medium: "Medium",
  high: "High / precise",
};

const ASPECT_COUNT = ASPECT_RATIOS.length;
const RESOLUTION_COUNT = RESOLUTIONS.length;

/**
 * Output settings 组合下拉：一个控件内分组选择 Aspect Ratio / Resolution / Quality。
 * 选中后按钮文案形如 square(1:1) | 1k | low；菜单保持打开，方便一次调好三项。
 */
function OutputSettingsSelect({
  aspectRatio,
  resolution,
  quality,
  isPro,
  disabled = false,
  onChangeAspect,
  onChangeResolution,
  onChangeQuality,
}: Readonly<{
  aspectRatio: AspectRatio;
  resolution: Resolution;
  quality: Quality;
  isPro: boolean;
  disabled?: boolean;
  onChangeAspect: (next: AspectRatio) => void;
  onChangeResolution: (next: Resolution) => void;
  onChangeQuality: (next: Quality) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo<readonly OutputOption[]>(
    () => [
      ...ASPECT_RATIOS.map((option) => ({
        group: "aspect" as const,
        value: option,
        label: `${aspectLabels[option]} (${option})`,
        locked: false,
        selected: option === aspectRatio,
      })),
      ...RESOLUTIONS.map((option) => ({
        group: "resolution" as const,
        value: option,
        label: RESOLUTION_LABELS[option],
        locked: option !== "1k" && !isPro,
        selected: option === resolution,
      })),
      ...QUALITIES.map((option) => ({
        group: "quality" as const,
        value: option,
        label: QUALITY_LABELS[option],
        locked: option !== "low" && !isPro,
        selected: option === quality,
      })),
    ],
    [aspectRatio, isPro, quality, resolution],
  );

  const sections = useMemo(
    () => [
      {
        label: "Aspect Ratio",
        startIndex: 0,
        options: options.slice(0, ASPECT_COUNT),
      },
      {
        label: "Resolution",
        startIndex: ASPECT_COUNT,
        options: options.slice(ASPECT_COUNT, ASPECT_COUNT + RESOLUTION_COUNT),
      },
      {
        label: "Quality",
        startIndex: ASPECT_COUNT + RESOLUTION_COUNT,
        options: options.slice(ASPECT_COUNT + RESOLUTION_COUNT),
      },
    ],
    [options],
  );

  const selectedIndex = useMemo(
    () =>
      Math.max(
        0,
        options.findIndex((option) => option.selected),
      ),
    [options],
  );

  const selectedSummaryLocked = options.some(
    (option) => option.locked && option.selected,
  );

  function openMenu(): void {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function selectAt(index: number): void {
    const option = options[index];
    if (!option) {
      return;
    }
    switch (option.group) {
      case "aspect":
        onChangeAspect(option.value as AspectRatio);
        break;
      case "resolution":
        onChangeResolution(option.value as Resolution);
        break;
      case "quality":
        onChangeQuality(option.value as Quality);
        break;
    }
    setActiveIndex(index);
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
        aria-controls="output-settings-listbox"
        aria-activedescendant={
          open ? `output-option-${activeIndex}` : undefined
        }
        aria-label="Output settings"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
      >
        <span className="option-control-label">
          <span className="option-control-text">
            <span>
              {aspectLabels[aspectRatio].toLowerCase()}({aspectRatio})
            </span>
            <span className="output-summary-sep" aria-hidden="true">
              |
            </span>
            <span>{resolution}</span>
            <span className="output-summary-sep" aria-hidden="true">
              |
            </span>
            <span>{quality}</span>
          </span>
          {selectedSummaryLocked && (
            <LockKeyhole size={13} className="option-lock" aria-hidden="true" />
          )}
        </span>
        <ChevronDown size={14} className="option-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          id="output-settings-listbox"
          className="option-menu output-settings-menu"
          role="listbox"
          aria-label="Output settings"
        >
          {sections.map((section) => (
            <fieldset
              key={section.label}
              className="output-section"
              aria-label={section.label}
            >
              <span className="output-section-label">{section.label}</span>
              <div className="output-section-options">
                {section.options.map((option, index) => {
                  const flatIndex = section.startIndex + index;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      id={`output-option-${flatIndex}`}
                      role="option"
                      aria-selected={option.selected}
                      className={`option-item ${
                        option.selected ? "is-selected" : ""
                      } ${flatIndex === activeIndex ? "is-active" : ""}`}
                      onClick={() => selectAt(flatIndex)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
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
                      {option.selected && (
                        <Check
                          size={13}
                          className="option-check"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

const PENDING_GENERATIONS_KEY = "ttp_pending_generations";
const GIVE_UP_AFTER_FAILURES = 5;
// 偶发 404（如身份/会话抖动）先按普通失败重试，连续多次才认为任务不可达
const MAX_404_BEFORE_REMOVAL = 4;

const TERMINAL_STATUSES: ReadonlySet<GenerationResponse["status"]> = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
  "timed_out",
]);

function isTerminalStatus(status: GenerationResponse["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

function readPendingGenerationIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(PENDING_GENERATIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writePendingGenerationIds(ids: readonly string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      PENDING_GENERATIONS_KEY,
      JSON.stringify([...new Set(ids)]),
    );
  } catch {
    // sessionStorage 不可用时轮询仍可用，只是刷新后无法恢复
  }
}

function track(name: string): void {
  window.umami?.track(name);
}

function generationLimitKind(error: unknown): "guest" | "free" | null {
  if (!(error instanceof HTTPError)) {
    return null;
  }
  const body: unknown = error.data;
  if (
    typeof body !== "object" ||
    body === null ||
    !("code" in body) ||
    typeof body.code !== "string"
  ) {
    return null;
  }
  switch (body.code) {
    case "GUEST_LIMIT_REACHED":
      return "guest";
    case "FREE_DAILY_LIMIT_REACHED":
      return "free";
    default:
      return null;
  }
}

function revealGeneration(id: string): void {
  window.requestAnimationFrame(() => {
    const card = document.getElementById(`generation-${id}`);
    if (!card) {
      return;
    }
    const bounds = card.getBoundingClientRect();
    if (bounds.bottom > 0 && bounds.top < window.innerHeight) {
      return;
    }
    card.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  });
}

// 图片是 Supabase 的跨域签名 URL，浏览器的 download 属性会被忽略（直接打开图片），
// 所以改为抓取 blob 后触发本地下载；CORS/网络异常时退回新标签打开。
async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function downloadTrackedImage(url: string, filename: string): void {
  track("download_completed");
  void downloadImage(url, filename);
}

type StudioTab = "examples" | "history";
type HistoryPoster = ReturnType<typeof flattenRecentPosterImages>[number];
type HistoryItem =
  | Readonly<{
      kind: "poster";
      key: string;
      poster: HistoryPoster;
    }>
  | Readonly<{
      kind: "failure";
      key: string;
      generation: GenerationResponse;
    }>;

function historyPosterKey(poster: HistoryPoster): string {
  return `${poster.generationId}-${poster.image.id}`;
}

function historyFailureKey(generation: GenerationResponse): string {
  return `failure-${generation.id}`;
}

function historyItemDate(item: HistoryItem): string {
  return item.kind === "poster"
    ? item.poster.createdAt
    : item.generation.createdAt;
}

function formatHistoryDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StudioTabs({
  activeTab,
  onChange,
}: Readonly<{
  activeTab: StudioTab;
  onChange: (tab: StudioTab) => void;
}>): JSX.Element {
  return (
    <div className="studio-tabs" role="tablist" aria-label="Poster results">
      <button
        type="button"
        role="tab"
        id="studio-examples-tab"
        aria-selected={activeTab === "examples"}
        aria-controls="studio-examples-panel"
        className={`studio-tab ${activeTab === "examples" ? "is-active" : ""}`}
        onClick={() => onChange("examples")}
      >
        <Images size={18} aria-hidden="true" /> Examples
      </button>
      <button
        type="button"
        role="tab"
        id="studio-history-tab"
        aria-selected={activeTab === "history"}
        aria-controls="studio-history-panel"
        className={`studio-tab ${activeTab === "history" ? "is-active" : ""}`}
        onClick={() => onChange("history")}
      >
        <History size={18} aria-hidden="true" /> History
      </button>
    </div>
  );
}

function StudioExamplesPanel({
  examples,
  activeIndex,
  onIndexChange,
  onUseExample,
}: Readonly<{
  examples: readonly PosterStudioExample[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onUseExample: (example: PosterStudioExample) => void;
}>): JSX.Element {
  const example = examples[activeIndex] ?? examples[0];
  if (!example) {
    return <div className="studio-panel-empty">No examples available.</div>;
  }
  const nextIndex = (activeIndex + 1) % examples.length;
  const previousIndex = (activeIndex - 1 + examples.length) % examples.length;
  const changeIndex = (index: number): void => {
    onIndexChange((index + examples.length) % examples.length);
  };
  const move = (direction: -1 | 1): void => {
    changeIndex(activeIndex + direction);
  };

  return (
    <div
      id="studio-examples-panel"
      className="studio-showcase studio-examples-panel"
      role="tabpanel"
      aria-labelledby="studio-examples-tab"
    >
      <section
        className="studio-example-carousel"
        aria-label={`Example ${activeIndex + 1} of ${examples.length}`}
      >
        <button
          type="button"
          className="studio-example-image-button"
          onClick={() => onUseExample(example)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
          aria-label={`Use the ${example.label} example prompt`}
        >
          <Image
            src={example.image}
            alt={example.alt}
            width={example.width ?? 1024}
            height={example.height ?? 1280}
            sizes="(max-width: 800px) 100vw, 52vw"
            priority={activeIndex === 0}
          />
        </button>
        {examples.length > 1 && (
          <>
            <button
              type="button"
              className="studio-carousel-arrow studio-carousel-arrow-left"
              onClick={() => move(-1)}
              aria-label={`Previous example: ${examples[previousIndex]?.label ?? ""}`}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="studio-carousel-arrow studio-carousel-arrow-right"
              onClick={() => move(1)}
              aria-label={`Next example: ${examples[nextIndex]?.label ?? ""}`}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </>
        )}
      </section>
      <fieldset className="studio-carousel-dots" aria-label="Choose an example">
        {examples.map((item, index) => (
          <button
            type="button"
            className={`studio-carousel-dot ${index === activeIndex ? "is-active" : ""}`}
            key={item.image}
            onClick={() => changeIndex(index)}
            aria-label={`Show example ${index + 1}: ${item.label}`}
            aria-current={index === activeIndex ? "true" : undefined}
          />
        ))}
      </fieldset>
      <button
        type="button"
        className="studio-example-prompt"
        onClick={() => onUseExample(example)}
        title={example.prompt}
      >
        <span className="studio-example-label">{example.label}</span>
        <span className="studio-example-prompt-text">{example.prompt}</span>
      </button>
    </div>
  );
}

function StudioHistoryProgress({
  generation,
  onDismiss,
}: Readonly<{
  generation: GenerationResponse;
  onDismiss?: () => void;
}>): JSX.Element {
  const isSubmitted = generation.status === "submitted";
  const isFailure =
    generation.status === "failed" || generation.status === "timed_out";
  return (
    <div className="studio-history-progress" aria-live="polite">
      <div
        className={`studio-history-progress-media ${isFailure ? "is-failure" : ""}`}
        style={{ aspectRatio: generation.aspectRatio.replace(":", " / ") }}
      >
        {isFailure ? (
          <div className="studio-history-progress-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <strong>
              {generation.status === "timed_out"
                ? "Generation timed out"
                : "Generation failed"}
            </strong>
            <p>{generationFailureMessage(generation)}</p>
            {generation.error && <span>Nothing was charged for this run.</span>}
            {onDismiss && (
              <button type="button" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        ) : (
          <span>
            {isSubmitted ? "Preparing poster…" : "Generating poster…"}
          </span>
        )}
      </div>
    </div>
  );
}

function StudioHistoryThumbnails({
  items,
  selectedKey,
  onSelect,
  isGenerating = false,
}: Readonly<{
  items: readonly HistoryItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  isGenerating?: boolean;
}>): JSX.Element {
  return (
    <fieldset
      className="studio-history-thumbnails"
      aria-label="Generation history"
    >
      {isGenerating && (
        <div
          className="studio-history-thumbnail is-pending"
          role="status"
          aria-label="Generation in progress"
        >
          <LoaderCircle size={22} aria-hidden="true" />
        </div>
      )}
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          className={`studio-history-thumbnail ${item.kind === "failure" ? "is-failure" : ""} ${item.key === selectedKey ? "is-active" : ""}`}
          onClick={() => onSelect(item.key)}
          aria-label={
            item.kind === "failure"
              ? `View failed generation ${index + 1}, generated ${formatHistoryDate(item.generation.createdAt)}`
              : `View poster ${index + 1}, generated ${formatHistoryDate(item.poster.createdAt)}`
          }
          aria-current={item.key === selectedKey ? "true" : undefined}
        >
          {item.kind === "failure" ? (
            <CircleAlert size={22} aria-hidden="true" />
          ) : (
            <Image
              src={item.poster.image.url}
              alt=""
              width={96}
              height={120}
              sizes="5rem"
            />
          )}
        </button>
      ))}
    </fieldset>
  );
}

function StudioHistoryPanel({
  items,
  selectedKey,
  activeGeneration,
  isGuest,
  onSelect,
  onZoom,
  onDownload,
  onEdit,
  onRetry,
  dismissibleFailureIds,
  onDismissFailure,
}: Readonly<{
  items: readonly HistoryItem[];
  selectedKey: string | null;
  activeGeneration: GenerationResponse | undefined;
  isGuest: boolean;
  onSelect: (key: string) => void;
  onZoom: (url: string) => void;
  onDownload: (url: string, filename: string) => void;
  onEdit: (generationId: string) => void;
  onRetry: (generationId: string) => void;
  dismissibleFailureIds: ReadonlySet<string>;
  onDismissFailure: (generationId: string) => void;
}>): JSX.Element {
  const selected = items.find((item) => item.key === selectedKey);
  const [loadError, setLoadError] = useState(false);

  const selectedPoster =
    selected?.kind === "poster" ? selected.poster : undefined;
  const selectedFailure =
    selected?.kind === "failure" ? selected.generation : undefined;

  if (activeGeneration) {
    return (
      <div
        id="studio-history-panel"
        className="studio-showcase studio-history-panel"
        role="tabpanel"
        aria-labelledby="studio-history-tab"
      >
        <div className="studio-history-main">
          <StudioHistoryProgress generation={activeGeneration} />
        </div>
        <StudioHistoryThumbnails
          items={items}
          selectedKey={selectedKey}
          onSelect={onSelect}
          isGenerating
        />
        {isGuest && (
          <p className="studio-history-note">
            Only this browser · saved for 24 hours ·{" "}
            <a href="/login?next=/%23studio">Sign in to keep 7 days</a>
          </p>
        )}
      </div>
    );
  }

  if (!selected || (!selectedPoster && !selectedFailure)) {
    return (
      <div
        id="studio-history-panel"
        className="studio-showcase studio-history-panel studio-history-empty"
        role="tabpanel"
        aria-labelledby="studio-history-tab"
      >
        <p className="eyebrow">No saved posters yet</p>
        <p>Generate a poster and it will appear here for quick comparison.</p>
        {isGuest && (
          <span>Guest posters stay in this browser for 24 hours.</span>
        )}
      </div>
    );
  }

  const filename = `text-to-poster-${selectedPoster?.generationId.slice(0, 8) ?? "poster"}.png`;
  return (
    <div
      id="studio-history-panel"
      className="studio-showcase studio-history-panel"
      role="tabpanel"
      aria-labelledby="studio-history-tab"
    >
      <div className="studio-history-main">
        {selectedFailure ? (
          <StudioHistoryProgress
            generation={selectedFailure}
            {...(dismissibleFailureIds.has(selectedFailure.id)
              ? {
                  onDismiss: () => onDismissFailure(selectedFailure.id),
                }
              : {})}
          />
        ) : selectedPoster ? (
          loadError ? (
            <button
              type="button"
              className="studio-history-retry"
              style={{
                aspectRatio: selectedPoster.aspectRatio.replace(":", " / "),
              }}
              onClick={() => {
                setLoadError(false);
                onRetry(selectedPoster.generationId);
              }}
            >
              Couldn’t load poster. Retry
            </button>
          ) : (
            <button
              type="button"
              className="studio-history-image-button"
              onClick={() => onZoom(selectedPoster.image.url)}
              aria-label={`View ${selectedPoster.image.alt} full size`}
              style={{
                aspectRatio: selectedPoster.aspectRatio.replace(":", " / "),
              }}
            >
              <Image
                src={selectedPoster.image.url}
                alt={selectedPoster.image.alt}
                width={1024}
                height={1280}
                sizes="(max-width: 800px) 100vw, 52vw"
                onError={() => setLoadError(true)}
              />
            </button>
          )
        ) : null}
      </div>
      <div className="studio-history-meta">
        <time
          dateTime={selectedPoster?.createdAt ?? selectedFailure?.createdAt}
        >
          {formatHistoryDate(
            selectedPoster?.createdAt ?? selectedFailure?.createdAt ?? "",
          )}
        </time>
        {selectedPoster && (
          <div className="studio-history-actions">
            <button
              type="button"
              className="result-action-button"
              onClick={() => onDownload(selectedPoster.image.url, filename)}
              disabled={loadError}
            >
              <ArrowDownToLine size={14} aria-hidden="true" /> Download
            </button>
            <button
              type="button"
              className="result-action-button"
              onClick={() => onEdit(selectedPoster.generationId)}
            >
              <Pencil size={13} aria-hidden="true" /> Edit again
            </button>
          </div>
        )}
      </div>
      <StudioHistoryThumbnails
        items={items}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
      {isGuest && (
        <p className="studio-history-note">
          Only this browser · saved for 24 hours ·{" "}
          <a href="/login?next=/%23studio">Sign in to keep 7 days</a>
        </p>
      )}
    </div>
  );
}

export function PosterStudio({
  isPro,
  isGuest,
  initialStyle,
  examples: providedExamples,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<PosterStyle>(initialStyle ?? "auto");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [resolution, setResolution] = useState<Resolution>("1k");
  const [quality, setQuality] = useState<Quality>("low");
  // 默认 1 张；免费用户最大 2 张，Pro 可选 1-4 张
  const [imageCount, setImageCount] = useState<ImageCount>(1);
  const [generations, setGenerations] = useState<GenerationResponse[]>([]);
  const [recentGenerations, setRecentGenerations] = useState<
    GenerationResponse[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  // 免费用户选了 Pro 档位后点击 Generate 的升级提示
  const [upgradePrompt, setUpgradePrompt] = useState(false);
  const [upgradePromptReason, setUpgradePromptReason] = useState<
    "options" | "daily"
  >("options");
  const [guestLimitPrompt, setGuestLimitPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] =
    useState<GenerationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>("examples");
  const [activeExampleIndex, setActiveExampleIndex] = useState(0);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(
    null,
  );
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editContentId, setEditContentId] = useState<string | null>(null);
  const [editContentFields, setEditContentFields] =
    useState<BriefFields>(EMPTY_BRIEF_FIELDS);
  const [urlPipelineOpen, setUrlPipelineOpen] = useState(false);
  const guestLimitDialogRef = useRef<HTMLDialogElement>(null);
  const guestLimitCloseRef = useRef<HTMLButtonElement>(null);
  const upgradeDialogRef = useRef<HTMLDialogElement>(null);
  const upgradeCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxDialogRef = useRef<HTMLDialogElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const editContentDialogRef = useRef<HTMLDialogElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const promptFieldRef = useRef<HTMLTextAreaElement>(null);
  const guestLimitPreviousFocus = useRef<HTMLElement | null>(null);
  const upgradePreviousFocus = useRef<HTMLElement | null>(null);
  const lightboxPreviousFocus = useRef<HTMLElement | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pollAttempts = useRef(new Map<string, number>());
  const poll404Counts = useRef(new Map<string, number>());
  const pollingIds = useRef(new Set<string>());
  const advanceFailures = useRef(new Map<string, number>());
  const advancingIds = useRef(new Set<string>());
  const workingIds = useRef(new Set<string>());
  const activeIds = useRef(new Set<string>());
  const trackedIds = useRef(new Set<string>());
  const dismissedIds = useRef(new Set<string>());
  const givenUpIds = useRef(new Set<string>());
  const generationById = useRef(new Map<string, GenerationResponse>());
  const submissionSequence = useRef(0);
  const paramsByGeneration = useRef(new Map<string, GenerationParams>());
  const inputTypeByGeneration = useRef(new Map<string, InputType>());
  const examples = providedExamples ?? STUDIO_JOB_EXAMPLES;

  function openEditContent(generation: GenerationResponse): void {
    setEditContentFields(deriveFieldsFromPrompt(generation.prompt));
    setEditContentId(generation.id);
    track("edit_content_click");
  }

  function updateEditedContent(): void {
    if (!editContentId) {
      return;
    }
    const params = paramsByGeneration.current.get(editContentId);
    track("edit_content_update");
    setEditContentId(null);
    void generate({
      prompt: buildBriefPrompt(editContentFields),
      inputType: params?.inputType ?? detectInputType(prompt),
      ...(params
        ? {
            style: params.style,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            quality: params.quality,
            imageCount: params.imageCount,
            ...(params.referenceImageUrl
              ? { referenceImageUrl: params.referenceImageUrl }
              : {}),
          }
        : {}),
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const pasted = event.clipboardData.getData("text");
    if (!pasted) {
      return;
    }
    const target = event.currentTarget;
    const nextValue =
      prompt.slice(0, target.selectionStart) +
      pasted +
      prompt.slice(target.selectionEnd);
    const inputType = detectInputType(nextValue);
    if (inputType === "url") {
      track("url_pasted");
    } else if (inputType === "text") {
      track("long_text_pasted");
    }
  }

  function openLightbox(url: string): void {
    lightboxPreviousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setLightbox(url);
  }

  function schedulePoll(id: string, delayMs: number): void {
    const existing = timers.current.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      timers.current.delete(id);
      void poll(id);
    }, delayMs);
    timers.current.set(id, timer);
  }

  function startPolling(id: string): void {
    const scheduled = timers.current.get(id);
    if (scheduled) {
      clearTimeout(scheduled);
      timers.current.delete(id);
    }
    if (pollingIds.current.has(id)) {
      return;
    }
    void poll(id);
  }

  function pollDelay(id: string): number {
    const attempts = pollAttempts.current.get(id) ?? 0;
    return generationPollDelay(
      attempts,
      typeof document !== "undefined" && document.hidden,
    );
  }

  function recordPollFailure(id: string): number {
    const attempts = (pollAttempts.current.get(id) ?? 0) + 1;
    pollAttempts.current.set(id, attempts);
    return pollDelay(id);
  }

  function trackGenerationOutcome(
    id: string,
    status: GenerationResponse["status"],
  ): void {
    // 只在本次会话中确实见过“生成中”后再上报，避免刷新恢复时重复统计
    if (!workingIds.current.has(id) || trackedIds.current.has(id)) {
      return;
    }
    trackedIds.current.add(id);
    track(
      status === "succeeded" || status === "partially_succeeded"
        ? "generation_succeeded"
        : "generation_failed",
    );
  }

  function applyGeneration(response: GenerationResponse): void {
    if (dismissedIds.current.has(response.id)) {
      return;
    }
    const next = mergeGenerationResponse(
      generationById.current.get(response.id),
      response,
    );
    generationById.current.set(next.id, next);
    if (!isTerminalStatus(next.status)) {
      workingIds.current.add(next.id);
      activeIds.current.add(next.id);
    } else {
      activeIds.current.delete(next.id);
      const scheduled = timers.current.get(next.id);
      if (scheduled) {
        clearTimeout(scheduled);
        timers.current.delete(next.id);
      }
    }
    setGenerations((prev) =>
      prev.some((g) => g.id === next.id)
        ? prev.map((g) => (g.id === next.id ? next : g))
        : [next, ...prev],
    );
    setRecentGenerations((prev) =>
      prev.filter((generation) => generation.id !== next.id),
    );
    if (next.status === "failed" || next.status === "timed_out") {
      setSelectedHistoryKey(historyFailureKey(next));
    } else if (
      (next.status === "succeeded" || next.status === "partially_succeeded") &&
      next.images[0]
    ) {
      setSelectedHistoryKey(`${next.id}-${next.images[0].id}`);
    }
    // 失败的不用恢复；成功的保留在 sessionStorage，刷新后仍能看到图片
    if (next.status === "failed" || next.status === "timed_out") {
      writePendingGenerationIds(
        readPendingGenerationIds().filter((id) => id !== next.id),
      );
    }
  }

  async function retryGenerationImage(id: string): Promise<void> {
    try {
      const raw: unknown = await ky
        .get(`/api/generations/${id}`, { timeout: 20_000 })
        .json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Poster refresh returned an invalid response.");
      }
      const next = mergeGenerationResponse(
        generationById.current.get(parsed.data.id),
        parsed.data,
      );
      generationById.current.set(next.id, next);
      setGenerations((prev) =>
        prev.map((generation) => (generation.id === id ? next : generation)),
      );
      setRecentGenerations((prev) =>
        prev.map((generation) => (generation.id === id ? next : generation)),
      );
    } catch {
      setError("Couldn’t refresh that poster. Try again shortly.");
    }
  }

  function applyRecentGenerations(
    responses: readonly GenerationResponse[],
  ): void {
    setRecentGenerations((prev) => {
      const currentIds = new Set(
        generations.map((generation) => generation.id),
      );
      const next = responses.filter(
        (generation) => !currentIds.has(generation.id),
      );
      const byId = new Map(
        prev.map((generation) => [generation.id, generation]),
      );
      for (const generation of next) {
        byId.set(generation.id, generation);
        generationById.current.set(generation.id, generation);
      }
      return [...byId.values()].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
    });
  }

  function moveCompletedGenerationsToRecent(): void {
    const completed = generations.filter(isVisibleGuestHistory);
    if (completed.length === 0) {
      return;
    }
    const completedIds = new Set(completed.map((generation) => generation.id));
    setGenerations((prev) =>
      prev.filter((generation) => !completedIds.has(generation.id)),
    );
    setRecentGenerations((prev) => {
      const byId = new Map(
        prev.map((generation) => [generation.id, generation]),
      );
      for (const generation of completed) {
        byId.set(generation.id, generation);
      }
      return [...byId.values()].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
    });
  }

  async function advance(id: string): Promise<void> {
    if (advancingIds.current.has(id)) {
      return;
    }
    advancingIds.current.add(id);
    try {
      const raw: unknown = await ky
        .post(`/api/generations/${id}/advance`, { timeout: 120_000 })
        .json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      pollAttempts.current.set(id, 0);
      advanceFailures.current.set(id, 0);
      applyGeneration(parsed.data);
      if (isTerminalStatus(parsed.data.status)) {
        trackGenerationOutcome(id, parsed.data.status);
      }
    } catch {
      // 主轮询继续重试，服务端恢复后会自动完成；连续失败给出提示，
      // 超过阈值后主动放弃，避免前端一直停留在“生成中/重连”
      const failures = (advanceFailures.current.get(id) ?? 0) + 1;
      advanceFailures.current.set(id, failures);
      if (failures >= GIVE_UP_AFTER_FAILURES) {
        void giveUpGeneration(id);
      }
    } finally {
      advancingIds.current.delete(id);
    }
  }

  async function giveUpGeneration(id: string): Promise<void> {
    if (givenUpIds.current.has(id)) {
      return;
    }
    givenUpIds.current.add(id);
    try {
      const raw: unknown = await ky
        .post(`/api/generations/${id}/give-up`, { timeout: 15_000 })
        .json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      applyGeneration(parsed.data);
      if (isTerminalStatus(parsed.data.status)) {
        trackGenerationOutcome(id, parsed.data.status);
      }
    } catch {
      // 放弃接口失败则继续轮询，由服务端 15 分钟超时/cron 兜底
    }
  }

  function dismissGeneration(id: string): void {
    dismissedIds.current.add(id);
    setGenerations((prev) => prev.filter((generation) => generation.id !== id));
    writePendingGenerationIds(
      readPendingGenerationIds().filter((pending) => pending !== id),
    );
  }

  function chooseExample(example: PosterStudioExample): void {
    setPrompt(example.prompt);
    promptFieldRef.current?.focus();
    track("studio_example_select");
  }

  function resetStudio(): void {
    dismissedIds.current.clear();
    generationById.current.clear();
    setGenerations([]);
    setPrompt("");
    setActiveTab("examples");
    setActiveExampleIndex(0);
    setSelectedHistoryKey(null);
    setStyle("auto");
    setAspectRatio("4:5");
    setResolution("1k");
    setQuality("low");
    setImageCount(1);
    setError(null);
    setUpgradePrompt(false);
    setGuestLimitPrompt(false);
    setLightbox(null);
    writePendingGenerationIds([]);
  }

  useEffect(() => {
    const dialog = lightboxDialogRef.current;
    if (!dialog) {
      return;
    }
    if (lightbox) {
      if (!lightboxPreviousFocus.current) {
        lightboxPreviousFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => lightboxCloseRef.current?.focus());
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    if (dialog.open) {
      dialog.close();
    }
    lightboxPreviousFocus.current?.focus();
    lightboxPreviousFocus.current = null;
  }, [lightbox]);

  useEffect(() => {
    const dialog = guestLimitDialogRef.current;
    if (!dialog) {
      return;
    }
    if (guestLimitPrompt) {
      if (!guestLimitPreviousFocus.current) {
        guestLimitPreviousFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => guestLimitCloseRef.current?.focus());
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    guestLimitPreviousFocus.current?.focus();
    guestLimitPreviousFocus.current = null;
  }, [guestLimitPrompt]);

  useEffect(() => {
    const dialog = upgradeDialogRef.current;
    if (!dialog) {
      return;
    }
    if (upgradePrompt) {
      if (!upgradePreviousFocus.current) {
        upgradePreviousFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => upgradeCloseRef.current?.focus());
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    upgradePreviousFocus.current?.focus();
    upgradePreviousFocus.current = null;
  }, [upgradePrompt]);

  useEffect(() => {
    const dialog = editContentDialogRef.current;
    if (!dialog) {
      return;
    }
    if (editContentId) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
  }, [editContentId]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }
      timers.current.clear();
      pollingIds.current.clear();
    },
    [],
  );

  // 刷新后恢复进行中/已完成的生图，避免页面状态丢失
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时恢复一次
  useEffect(() => {
    for (const id of readPendingGenerationIds()) {
      startPolling(id);
    }
    void recoverRecent();
  }, []);

  useEffect(() => {
    function resumeActivePolling(): void {
      if (document.hidden || !navigator.onLine) {
        return;
      }
      for (const id of activeIds.current) {
        startPolling(id);
      }
    }
    document.addEventListener("visibilitychange", resumeActivePolling);
    window.addEventListener("focus", resumeActivePolling);
    window.addEventListener("online", resumeActivePolling);
    return () => {
      document.removeEventListener("visibilitychange", resumeActivePolling);
      window.removeEventListener("focus", resumeActivePolling);
      window.removeEventListener("online", resumeActivePolling);
    };
  });

  async function recoverRecent(): Promise<void> {
    try {
      const raw: unknown = await ky
        .get("/api/generations/recent", { timeout: 20_000 })
        .json();
      const parsed = recentGenerationsSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Recent generation history was invalid.");
      }
      applyRecentGenerations(parsed.data.recent);
      const activeIds = parsed.data.active.map((generation) => generation.id);
      if (activeIds.length > 0) {
        writePendingGenerationIds([
          ...readPendingGenerationIds(),
          ...activeIds,
        ]);
      }
      for (const generation of parsed.data.active) {
        applyGeneration(generation);
        startPolling(generation.id);
      }
    } catch (error) {
      if (error instanceof HTTPError || error instanceof TimeoutError) {
        return;
      }
      setError("We could not restore recent generations.");
    }
  }

  async function poll(id: string): Promise<void> {
    if (pollingIds.current.has(id)) {
      return;
    }
    pollingIds.current.add(id);
    try {
      const raw: unknown = await ky
        .get(`/api/generations/${id}`, { timeout: 20_000 })
        .json();
      const parsed = generationResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("The generation response was invalid.");
      }
      pollAttempts.current.set(id, 0);
      poll404Counts.current.delete(id);
      applyGeneration(parsed.data);
      if (isTerminalStatus(parsed.data.status)) {
        trackGenerationOutcome(id, parsed.data.status);
        return;
      }
      // 后台推进（重活：查 APIMart + 下载/水印/上传）。按 nextPollAt 到期触发，
      // 接口幂等（未到期立即返回）；失败时下次轮询会重试
      const next = parsed.data.nextPollAt
        ? new Date(parsed.data.nextPollAt).getTime()
        : 0;
      if (Date.now() >= next) {
        void advance(id);
      }
      schedulePoll(id, pollDelay(id));
    } catch (pollError) {
      if (pollError instanceof HTTPError && pollError.response.status === 404) {
        // 偶发 404（如身份/会话抖动）不立即删卡片：先按普通失败重试，
        // 连续多次仍 404 才认为记录已删除，停止轮询并清理本地状态
        const misses = (poll404Counts.current.get(id) ?? 0) + 1;
        poll404Counts.current.set(id, misses);
        if (misses >= MAX_404_BEFORE_REMOVAL) {
          activeIds.current.delete(id);
          workingIds.current.delete(id);
          generationById.current.delete(id);
          pollAttempts.current.delete(id);
          poll404Counts.current.delete(id);
          const scheduled = timers.current.get(id);
          if (scheduled) {
            clearTimeout(scheduled);
            timers.current.delete(id);
          }
          writePendingGenerationIds(
            readPendingGenerationIds().filter((pending) => pending !== id),
          );
          setGenerations((prev) =>
            prev.filter((generation) => generation.id !== id),
          );
          setRecentGenerations((prev) =>
            prev.filter((generation) => generation.id !== id),
          );
          return;
        }
        const delay = recordPollFailure(id);
        schedulePoll(id, delay);
        return;
      }
      // 无论什么错误都继续轮询（带退避），避免页面永久停在“生成中”
      const delay = recordPollFailure(id);
      if (pollError instanceof TimeoutError) {
        schedulePoll(id, delay);
        return;
      }
      schedulePoll(id, delay);
    } finally {
      pollingIds.current.delete(id);
    }
  }

  async function generate(overrides?: GenerateOverrides): Promise<void> {
    setError(null);
    setUpgradePrompt(false);
    setGuestLimitPrompt(false);
    const generationPrompt = (overrides?.prompt ?? prompt).trim();
    const generationType = overrides?.inputType ?? detectInputType(prompt);
    const generationReferenceImage = overrides?.referenceImageUrl;
    const generationStyle = overrides?.style ?? style;
    const generationAspectRatio = overrides?.aspectRatio ?? aspectRatio;
    const generationResolution = overrides?.resolution ?? resolution;
    const generationQuality = overrides?.quality ?? quality;
    const generationImageCount = overrides?.imageCount ?? imageCount;
    // 按钮默认启用（对爬虫友好：HTML 中不显示 disabled），无输入时在提交前校验提示
    if (generationPrompt.length < 3) {
      setError(
        "Describe the poster you want — a subject, mood, or line of copy.",
      );
      return;
    }
    // 免费用户选了 Pro 档位：不发起请求，引导开通会员
    if (!isPro && needsPro) {
      upgradePreviousFocus.current = generateButtonRef.current;
      setUpgradePromptReason("options");
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
    setActiveTab("history");
    setIsSubmitting(true);
    const submissionKey = `pending-submission-${++submissionSequence.current}`;
    const submission: GenerationResponse = {
      id: submissionKey,
      status: "submitted",
      progress: 0,
      aspectRatio: generationAspectRatio,
      prompt: generationPrompt,
      createdAt: new Date().toISOString(),
      images: [],
      imageCount: generationImageCount,
      creditsReserved: 0,
    };
    const generationParams: GenerationParams = {
      style: generationStyle,
      aspectRatio: generationAspectRatio,
      resolution: generationResolution,
      quality: generationQuality,
      imageCount: generationImageCount,
      inputType: generationType,
      ...(generationReferenceImage
        ? { referenceImageUrl: generationReferenceImage }
        : {}),
    };
    paramsByGeneration.current.set(submissionKey, generationParams);
    inputTypeByGeneration.current.set(submissionKey, generationType);
    setPendingSubmission(submission);
    track("generation_started");
    track(
      generationType === "url"
        ? "url_input"
        : generationType === "text"
          ? "text_input"
          : "idea_input",
    );
    try {
      const raw: unknown = await ky
        .post("/api/generations", {
          json: {
            prompt: generationPrompt,
            inputType: generationType,
            style: generationStyle,
            aspectRatio: generationAspectRatio,
            resolution: generationResolution,
            quality: generationQuality,
            imageCount: generationImageCount,
            ...(generationReferenceImage
              ? { referenceImageUrl: generationReferenceImage }
              : {}),
          },
          timeout: 30_000,
        })
        .json();
      const created = generationCreatedSchema.safeParse(raw);
      if (!created.success) {
        const message =
          typeof raw === "object" &&
          raw !== null &&
          "error" in raw &&
          typeof raw.error === "string"
            ? raw.error
            : "We could not start this generation.";
        throw new Error(message);
      }
      const id = created.data.id;
      paramsByGeneration.current.set(id, generationParams);
      inputTypeByGeneration.current.set(id, generationType);
      moveCompletedGenerationsToRecent();
      writePendingGenerationIds([...readPendingGenerationIds(), id]);
      const accepted = generationAcceptedSchema.safeParse(raw);
      applyGeneration(
        accepted.success
          ? {
              ...accepted.data,
              prompt: submission.prompt,
              createdAt: submission.createdAt,
              images: [],
              imageCount: submission.imageCount,
            }
          : {
              id,
              status: "submitted",
              progress: 0,
              aspectRatio: submission.aspectRatio,
              prompt: submission.prompt,
              createdAt: submission.createdAt,
              images: [],
              imageCount: submission.imageCount,
              creditsReserved: 0,
            },
      );
      setPendingSubmission(null);
      startPolling(id);
      revealGeneration(id);
    } catch (submitError) {
      setPendingSubmission(null);
      const limitKind = generationLimitKind(submitError);
      if (limitKind === "guest") {
        guestLimitPreviousFocus.current = generateButtonRef.current;
        setGuestLimitPrompt(true);
      } else if (limitKind === "free") {
        upgradePreviousFocus.current = generateButtonRef.current;
        setUpgradePromptReason("daily");
        setUpgradePrompt(true);
      } else if (submitError instanceof HTTPError) {
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
  const anyWorking =
    generations.some(
      (g) => g.status === "submitted" || g.status === "processing",
    ) || pendingSubmission !== null;
  const maxFreeImages = isGuest ? GUEST_MAX_IMAGES : FREE_MAX_IMAGES;
  // 免费用户选了 Pro 档位（非 1K / 非 low / 超过 2 张）时，点击 Generate 提示升级
  const needsPro =
    !isPro &&
    (resolution !== FREE_RESOLUTION ||
      quality !== FREE_QUALITY ||
      imageCount > maxFreeImages);
  const action = generationAction(isPro, isSubmitting, anyWorking);
  const visibleGenerations = pendingSubmission
    ? [pendingSubmission, ...generations]
    : generations;
  const historyPosters = useMemo(() => {
    const seen = new Set<string>();
    return flattenRecentPosterImages([
      ...recentGenerations,
      ...generations,
    ]).filter((poster) => {
      const key = historyPosterKey(poster);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [generations, recentGenerations]);
  const historyFailures = useMemo(() => {
    const byId = new Map<string, GenerationResponse>();
    for (const generation of [...recentGenerations, ...generations]) {
      if (generation.status === "failed" || generation.status === "timed_out") {
        byId.set(generation.id, generation);
      }
    }
    return [...byId.values()].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  }, [generations, recentGenerations]);
  const historyItems = useMemo(() => {
    const byKey = new Map<string, HistoryItem>();
    for (const poster of historyPosters) {
      const key = historyPosterKey(poster);
      byKey.set(key, { kind: "poster", key, poster });
    }
    for (const generation of historyFailures) {
      const key = historyFailureKey(generation);
      byKey.set(key, { kind: "failure", key, generation });
    }
    return [...byKey.values()].sort(
      (left, right) =>
        new Date(historyItemDate(right)).getTime() -
        new Date(historyItemDate(left)).getTime(),
    );
  }, [historyFailures, historyPosters]);
  const dismissibleFailureIds = useMemo(
    () =>
      new Set(
        generations
          .filter(
            (generation) =>
              generation.status === "failed" ||
              generation.status === "timed_out",
          )
          .map((generation) => generation.id),
      ),
    [generations],
  );
  const activeHistoryGeneration = [...visibleGenerations]
    .filter(
      (generation) =>
        generation.status === "submitted" || generation.status === "processing",
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )[0];

  useEffect(() => {
    setSelectedHistoryKey((current) => {
      if (current && historyItems.some((item) => item.key === current)) {
        return current;
      }
      return historyItems[0]?.key ?? null;
    });
  }, [historyItems]);

  return (
    <section
      className="studio-shell"
      id="studio"
      aria-labelledby="studio-heading"
    >
      <div className="studio-header">
        <div>
          <p className="eyebrow">AI poster generator from text</p>
          <h2 id="studio-heading">Describe your poster.</h2>
        </div>
        <span className="studio-count">One brief / multiple directions</span>
      </div>

      <div className="studio-grid">
        <div className="studio-controls">
          <label className="field-label" htmlFor="poster-prompt">
            Describe your poster idea
          </label>
          <textarea
            ref={promptFieldRef}
            id="poster-prompt"
            className="prompt-field"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={handlePaste}
            placeholder="Describe an idea, paste text, or drop a URL…"
            maxLength={1500}
            rows={5}
            disabled={isSubmitting}
          />
          <div className="field-hint">
            <span>Works with Idea · Text · URL</span>
            <span>{prompt.length}/1500</span>
          </div>

          <fieldset className="control-block">
            <legend className="field-label">Output settings</legend>
            <div className="studio-options">
              <div className="option-select option-select--wide">
                <span>Output</span>
                <OutputSettingsSelect
                  aspectRatio={aspectRatio}
                  resolution={resolution}
                  quality={quality}
                  isPro={isPro}
                  disabled={isSubmitting}
                  onChangeAspect={(next) => {
                    setAspectRatio(next);
                    setUpgradePrompt(false);
                  }}
                  onChangeResolution={(next) => {
                    setResolution(next);
                    setUpgradePrompt(false);
                  }}
                  onChangeQuality={(next) => {
                    setQuality(next);
                    setUpgradePrompt(false);
                  }}
                />
              </div>
              <div className="option-select">
                <span>Art direction</span>
                <TierSelect
                  label="Art direction"
                  value={style}
                  menuClassName="art-direction-menu"
                  gridColumns={4}
                  onChange={(next) => {
                    if (STYLES.some((option) => option === next)) {
                      setStyle(next as PosterStyle);
                      setUpgradePrompt(false);
                    }
                  }}
                  disabled={isSubmitting}
                  options={STYLES.slice(0, -1).map((option) => ({
                    value: option,
                    label: styleLabels[option],
                    locked: false,
                  }))}
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
                  disabled={isSubmitting}
                  options={IMAGE_COUNTS.map((count) => ({
                    value: String(count),
                    label: `${count} ${count === 1 ? "poster" : "posters"}`,
                    locked: isGuest
                      ? count !== GUEST_MAX_IMAGES
                      : !isPro && count > FREE_MAX_IMAGES,
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
              <LockKeyhole size={14} />
              {isGuest
                ? " Guests can make 1 generation per UTC day. Sign in for 4 free generations each day."
                : " Free accounts can make up to 4 generations per UTC day. Runs are 1K, watermarked, and include up to 2 posters. Pro unlocks full quality and 4 posters."}
            </p>
          )}

          <button
            ref={generateButtonRef}
            className="generate-button"
            type="button"
            onClick={() => {
              // 免费用户选了 Pro 档位时，先弹升级提示，不做任何后续动作
              if (needsPro) {
                upgradePreviousFocus.current = generateButtonRef.current;
                setUpgradePromptReason("options");
                setUpgradePrompt(true);
              } else if (
                // 粘贴后立刻点击的场景下，300ms debounce 可能还没更新 detectedType，
                // 这里同步判断，保证 URL 一定会走管线弹窗而不是直接生成。
                detectInputType(prompt) === "url" &&
                prompt.trim()
              ) {
                setUrlPipelineOpen(true);
              } else {
                void generate();
              }
            }}
            disabled={action.disabled}
          >
            <Sparkles size={18} /> {action.label}
          </button>
          <p className="ai-disclosure">
            AI-generated with GPT Image 2.{" "}
            <a href="/ai-policy">Read the AI use policy.</a>
          </p>
          {error && (
            <p className="error-message" role="alert">
              <CircleAlert size={16} /> {error}
            </p>
          )}
        </div>

        <div className="studio-results">
          <StudioTabs activeTab={activeTab} onChange={setActiveTab} />
          {activeTab === "examples" ? (
            <StudioExamplesPanel
              examples={examples}
              activeIndex={activeExampleIndex}
              onIndexChange={setActiveExampleIndex}
              onUseExample={chooseExample}
            />
          ) : (
            <>
              <StudioHistoryPanel
                key={selectedHistoryKey ?? "empty-history"}
                items={historyItems}
                selectedKey={selectedHistoryKey}
                activeGeneration={activeHistoryGeneration}
                isGuest={isGuest}
                onSelect={setSelectedHistoryKey}
                onZoom={openLightbox}
                onDownload={downloadTrackedImage}
                onEdit={(generationId) => {
                  const generation = generationById.current.get(generationId);
                  if (generation) {
                    openEditContent(generation);
                  }
                }}
                onRetry={(id) => void retryGenerationImage(id)}
                dismissibleFailureIds={dismissibleFailureIds}
                onDismissFailure={dismissGeneration}
              />
              {generations.length > 0 && !anyWorking && (
                <button
                  className="reset-button"
                  type="button"
                  onClick={resetStudio}
                >
                  Start a new brief
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <dialog
        ref={guestLimitDialogRef}
        className="modal-backdrop"
        aria-labelledby="guest-limit-title"
        aria-describedby="guest-limit-note"
        onCancel={(event) => {
          event.preventDefault();
          setGuestLimitPrompt(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setGuestLimitPrompt(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setGuestLimitPrompt(false);
          }
        }}
      >
        <div className="modal-card">
          <button
            ref={guestLimitCloseRef}
            type="button"
            className="modal-close"
            aria-label="Close sign-in prompt"
            onClick={() => setGuestLimitPrompt(false)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Free account</p>
          <h3 id="guest-limit-title">Get 4 free generations every day.</h3>
          <p className="modal-note" id="guest-limit-note">
            You&apos;ve used today&apos;s guest generation. Sign in or create a
            free account to keep generating today. Failed generations do not
            count.
          </p>
          <LoginForm
            next="/#studio"
            onSuccess={() => setGuestLimitPrompt(false)}
          />
        </div>
      </dialog>
      <dialog
        ref={upgradeDialogRef}
        className="modal-backdrop"
        aria-labelledby="upgrade-title"
        aria-describedby="upgrade-note"
        onCancel={(event) => {
          event.preventDefault();
          setUpgradePrompt(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setUpgradePrompt(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setUpgradePrompt(false);
          }
        }}
      >
        <div className="modal-card">
          <button
            ref={upgradeCloseRef}
            type="button"
            className="modal-close"
            aria-label="Close upgrade prompt"
            onClick={() => setUpgradePrompt(false)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Pro feature</p>
          <h3 id="upgrade-title">
            {upgradePromptReason === "daily"
              ? "Today\u2019s free generations are used up."
              : "These options are Pro only."}
          </h3>
          <p className="modal-note" id="upgrade-note">
            {upgradePromptReason === "daily"
              ? "You\u2019ve used today\u2019s 4 free generations. Upgrade to Pro to keep creating today, or come back tomorrow after the quota resets at 00:00 UTC."
              : "You picked a higher resolution, finish, or more posters. Upgrade to Pro to generate with these options."}
          </p>
          <div className="modal-actions">
            <button
              className="outline-button"
              type="button"
              onClick={() => setUpgradePrompt(false)}
            >
              Maybe later
            </button>
            <a className="solid-button" href="/pricing">
              Upgrade to Pro
            </a>
          </div>
        </div>
      </dialog>
      <dialog
        ref={lightboxDialogRef}
        className="lightbox"
        aria-label="Full size preview"
        onCancel={(event) => {
          event.preventDefault();
          setLightbox(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setLightbox(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setLightbox(null);
          }
        }}
      >
        {lightbox && (
          <>
            <button
              ref={lightboxCloseRef}
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
              className="lightbox-image"
            />
          </>
        )}
      </dialog>
      <dialog
        ref={editContentDialogRef}
        className="modal-backdrop"
        aria-labelledby="edit-content-title"
        onCancel={(event) => {
          event.preventDefault();
          setEditContentId(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setEditContentId(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditContentId(null);
          }
        }}
      >
        <div className="modal-card edit-content-card">
          <button
            type="button"
            className="modal-close"
            aria-label="Close edit content"
            onClick={() => setEditContentId(null)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Edit content</p>
          <h3 id="edit-content-title">Update the poster copy</h3>
          <div className="brief-form">
            <label>
              <span>Headline</span>
              <input
                type="text"
                value={editContentFields.headline}
                maxLength={BRIEF_CHAR_LIMITS.headline}
                onChange={(event) =>
                  setEditContentFields({
                    ...editContentFields,
                    headline: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Subtitle</span>
              <input
                type="text"
                value={editContentFields.subtitle}
                maxLength={BRIEF_CHAR_LIMITS.subtitle}
                onChange={(event) =>
                  setEditContentFields({
                    ...editContentFields,
                    subtitle: event.target.value,
                  })
                }
              />
            </label>
            <fieldset className="brief-points-field">
              <legend>Key points</legend>
              <BriefPointInput
                value={editContentFields.points[0] ?? ""}
                onChange={(value) =>
                  setEditContentFields({
                    ...editContentFields,
                    points: [
                      value,
                      editContentFields.points[1] ?? "",
                      editContentFields.points[2] ?? "",
                    ],
                  })
                }
              />
              <BriefPointInput
                value={editContentFields.points[1] ?? ""}
                onChange={(value) =>
                  setEditContentFields({
                    ...editContentFields,
                    points: [
                      editContentFields.points[0] ?? "",
                      value,
                      editContentFields.points[2] ?? "",
                    ],
                  })
                }
              />
              <BriefPointInput
                value={editContentFields.points[2] ?? ""}
                onChange={(value) =>
                  setEditContentFields({
                    ...editContentFields,
                    points: [
                      editContentFields.points[0] ?? "",
                      editContentFields.points[1] ?? "",
                      value,
                    ],
                  })
                }
              />
            </fieldset>
            <label>
              <span>CTA (optional)</span>
              <input
                type="text"
                value={editContentFields.cta}
                maxLength={BRIEF_CHAR_LIMITS.cta}
                onChange={(event) =>
                  setEditContentFields({
                    ...editContentFields,
                    cta: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="outline-button"
              onClick={() => setEditContentId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="solid-button"
              onClick={updateEditedContent}
            >
              Update poster
            </button>
          </div>
        </div>
      </dialog>
      <UrlPipelineModal
        open={urlPipelineOpen}
        url={prompt.trim()}
        onClose={() => setUrlPipelineOpen(false)}
        onGenerate={(promptText, referenceImageUrl) =>
          void generate({
            prompt: promptText,
            inputType: "url",
            ...(referenceImageUrl ? { referenceImageUrl } : {}),
          })
        }
      />
    </section>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
