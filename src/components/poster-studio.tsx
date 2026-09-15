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
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
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
  type GenerationResponse,
  generationAcceptedSchema,
  generationCreatedSchema,
  generationResponseSchema,
  IMAGE_COUNTS,
  type ImageCount,
  isAspectRatio,
  MAX_REFERENCE_IMAGES,
  type OutputAspect,
  type PosterStyle,
  QUALITIES,
  type Quality,
  RESOLUTIONS,
  type Resolution,
  recentGenerationsSchema,
  STYLES,
} from "@/lib/domain/poster";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
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
  /** 用户是否购买过积分包（解锁全档位 + 无水印） */
  hasPack: boolean;
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
  {
    id: "vintage-romance",
    label: "Vintage romance",
    prompt:
      "Period romance poster for The Orchard Letters, set in 1936 rural Provence where two separated lovers exchange handwritten notes through an old orchard. Use a painterly gouache style with a couple seen from above on opposite sides of a long picnic blanket, connected by a winding path of white blossoms that creates a soft S-curve. Build a warm terracotta, faded teal, butter-yellow, and paper-cream palette, with sun-faded print texture, a generous top margin, and an elegant centered serif title framed by small botanical ornaments.",
    image: "/examples/movie-the-orchard-letters.webp",
    alt: "The Orchard Letters period-romance poster with two letter writers in a Provençal orchard.",
    width: 1024,
    height: 1280,
  },
];

// 游客体验：1K / low / 每次 1 张，终身共 2 次（服务端 guest_usage 计数）；
// 登录的积分用户解锁全部档位，按积分扣费，余额由 /api/account/status 返回
const GUEST_MAX_IMAGES = 1;

type AccountStatusPayload = Readonly<{
  signedIn: boolean;
  isPro: boolean;
  balance?: {
    available: number;
    bucket: string;
    grants: ReadonlyArray<{
      source: string;
      amount: number;
      createdAt: string;
    }>;
  } | null;
}>;

const EMPTY_BRIEF_FIELDS: BriefFields = {
  headline: "",
  subtitle: "",
  points: ["", "", ""],
  cta: "",
};

type GenerationParams = Readonly<{
  style: PosterStyle;
  aspectRatio: OutputAspect;
  resolution: Resolution;
  quality: Quality;
  imageCount: ImageCount;
  inputType: InputType;
  referenceImageUrl?: string;
  referenceImageUrls?: readonly string[];
}>;

type GenerateOverrides = Readonly<{
  prompt?: string;
  inputType?: InputType;
  referenceImageUrl?: string;
  referenceImageUrls?: readonly string[];
  style?: PosterStyle;
  aspectRatio?: OutputAspect;
  resolution?: Resolution;
  quality?: Quality;
  imageCount?: ImageCount;
}>;

// —— 图生图（参考图上传）——
type GenerationMode = "text" | "image";
type ReferenceImage = Readonly<{
  id: string;
  /** 服务端 URL；上传中为 null */
  url: string | null;
  /** 本地预览 URL（objectURL），上传成功后 revoke */
  previewUrl: string;
  name: string;
}>;
// 与服务端 uploads.ts 的限制保持一致（客户端预校验，服务端仍有魔数兜底）
const REFERENCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const REFERENCE_ACCEPTED_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function promptStudioLocale(rawLocale: string): UiLocale {
  return isUiLocale(rawLocale) ? rawLocale : "en";
}

async function fetchAccountStatus(): Promise<AccountStatusPayload | null> {
  try {
    return await ky
      .get("/api/account/status", { timeout: 15_000 })
      .json<AccountStatusPayload>();
  } catch {
    return null;
  }
}

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

const RESOLUTION_LABEL_KEYS: Readonly<Record<Resolution, string>> = {
  "1k": "resolution1k",
  "2k": "resolution2k",
  "4k": "resolution4k",
};

const QUALITY_LABEL_KEYS: Readonly<Record<Quality, string>> = {
  low: "qualityLow",
  medium: "qualityMedium",
  high: "qualityHigh",
  xhigh: "qualityXHigh",
  max: "qualityMax",
};

const ASPECT_LABEL_KEYS: Readonly<Record<AspectRatio, string>> = {
  "1:1": "aspectSquare",
  "4:5": "aspectPortrait",
  "3:4": "aspectEditorial",
  "2:3": "aspectClassic",
  "9:16": "aspectStory",
  "16:9": "aspectWide",
  "4:3": "aspectSlide",
  "3:2": "aspectLandscape",
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
  tier,
  disabled = false,
  onChangeAspect,
  onChangeResolution,
  onChangeQuality,
}: Readonly<{
  aspectRatio: AspectRatio;
  resolution: Resolution;
  quality: Quality;
  /** pro 全解锁；free 可用 1k + low/medium；guest 锁定 1k/low */
  tier: "pro" | "free" | "guest";
  disabled?: boolean;
  onChangeAspect: (next: AspectRatio) => void;
  onChangeResolution: (next: Resolution) => void;
  onChangeQuality: (next: Quality) => void;
}>) {
  const t = useTranslations("studio");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo<readonly OutputOption[]>(
    () => [
      ...ASPECT_RATIOS.map((option) => ({
        group: "aspect" as const,
        value: option,
        label: `${t(ASPECT_LABEL_KEYS[option])} (${option})`,
        locked: false,
        selected: option === aspectRatio,
      })),
      ...RESOLUTIONS.map((option) => ({
        group: "resolution" as const,
        value: option,
        label: t(RESOLUTION_LABEL_KEYS[option]),
        locked: option !== "1k" && tier !== "pro",
        selected: option === resolution,
      })),
      ...QUALITIES.map((option) => ({
        group: "quality" as const,
        value: option,
        label: t(QUALITY_LABEL_KEYS[option]),
        locked:
          tier === "pro"
            ? false
            : tier === "guest"
              ? option !== "low"
              : option === "high" || option === "xhigh" || option === "max",
        selected: option === quality,
      })),
    ],
    [aspectRatio, tier, quality, resolution, t],
  );

  const sections = useMemo(
    () => [
      {
        label: t("aspectRatio"),
        startIndex: 0,
        options: options.slice(0, ASPECT_COUNT),
      },
      {
        label: t("resolution"),
        startIndex: ASPECT_COUNT,
        options: options.slice(ASPECT_COUNT, ASPECT_COUNT + RESOLUTION_COUNT),
      },
      {
        label: t("quality"),
        startIndex: ASPECT_COUNT + RESOLUTION_COUNT,
        options: options.slice(ASPECT_COUNT + RESOLUTION_COUNT),
      },
    ],
    [options, t],
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
        aria-label={t("outputSettings")}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
      >
        <span className="option-control-label">
          <span className="option-control-text">
            <span>
              {t(ASPECT_LABEL_KEYS[aspectRatio]).toLowerCase()}({aspectRatio})
            </span>
            <span className="output-summary-sep" aria-hidden="true">
              |
            </span>
            <span>{t(RESOLUTION_LABEL_KEYS[resolution])}</span>
            <span className="output-summary-sep" aria-hidden="true">
              |
            </span>
            <span>{t(QUALITY_LABEL_KEYS[quality])}</span>
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
          aria-label={t("outputSettings")}
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

type ApiSubmitError = Readonly<{ code: string }>;

function readApiSubmitError(error: unknown): ApiSubmitError | null {
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
  return { code: body.code };
}

function generationLimitKind(error: unknown): "guest" | "credits" | null {
  const parsed = readApiSubmitError(error);
  if (!parsed) {
    return null;
  }
  switch (parsed.code) {
    case "GUEST_LIMIT_REACHED":
      return "guest";
    case "INSUFFICIENT_CREDITS":
      return "credits";
    default:
      return null;
  }
}

function isPromptSafetyFailure(error: unknown): boolean {
  const parsed = readApiSubmitError(error);
  if (!parsed) {
    return false;
  }
  switch (parsed.code) {
    case "PROMPT_SAFETY_BLOCKED":
    case "PROMPT_SAFETY_REVIEW_REQUIRED":
    case "PROMPT_SAFETY_UNAVAILABLE":
      return true;
    default:
      return false;
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
type MobileStudioTab = "create" | "results";
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

function formatHistoryDate(value: string, locale: UiLocale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
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
  const t = useTranslations("studio");
  return (
    <div className="studio-tabs" role="tablist" aria-label={t("posterResults")}>
      <button
        type="button"
        role="tab"
        id="studio-examples-tab"
        aria-selected={activeTab === "examples"}
        aria-controls="studio-examples-panel"
        className={`studio-tab ${activeTab === "examples" ? "is-active" : ""}`}
        onClick={() => onChange("examples")}
      >
        <Images size={18} aria-hidden="true" /> {t("examples")}
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
        <History size={18} aria-hidden="true" /> {t("history")}
      </button>
    </div>
  );
}

function MobileStudioTabs({
  activeTab,
  onChange,
}: Readonly<{
  activeTab: MobileStudioTab;
  onChange: (tab: MobileStudioTab) => void;
}>): JSX.Element {
  const t = useTranslations("studio");
  return (
    <div
      className="studio-mobile-tabs"
      role="tablist"
      aria-label={t("posterStudio")}
    >
      <button
        type="button"
        role="tab"
        id="studio-mobile-create-tab"
        aria-selected={activeTab === "create"}
        aria-controls="studio-mobile-create-panel"
        className={`studio-tab ${activeTab === "create" ? "is-active" : ""}`}
        onClick={() => onChange("create")}
      >
        <Sparkles size={18} aria-hidden="true" /> {t("create")}
      </button>
      <button
        type="button"
        role="tab"
        id="studio-mobile-results-tab"
        aria-selected={activeTab === "results"}
        aria-controls="studio-mobile-results-panel"
        className={`studio-tab ${activeTab === "results" ? "is-active" : ""}`}
        onClick={() => onChange("results")}
      >
        <History size={18} aria-hidden="true" /> {t("results")}
      </button>
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: Readonly<{
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void;
}>): JSX.Element {
  const t = useTranslations("studio");
  return (
    <div className="mode-switch" role="tablist" aria-label={t("generationMode")}>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "text"}
        className={`mode-switch-option ${mode === "text" ? "is-active" : ""}`}
        onClick={() => onChange("text")}
      >
        <Sparkles size={15} aria-hidden="true" /> {t("modeTextToPoster")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "image"}
        className={`mode-switch-option ${mode === "image" ? "is-active" : ""}`}
        onClick={() => onChange("image")}
      >
        <ImagePlus size={15} aria-hidden="true" /> {t("modeImageToPoster")}
      </button>
    </div>
  );
}

const REFERENCE_INPUT_ID = "reference-image-input";

function ReferenceUploader({
  images,
  disabled = false,
  onFiles,
  onRemove,
}: Readonly<{
  images: readonly ReferenceImage[];
  disabled?: boolean;
  onFiles: (files: readonly File[]) => void;
  onRemove: (id: string) => void;
}>): JSX.Element {
  const t = useTranslations("studio");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // 上传中的占位项已在 images 内（url === null），不重复计数
  const occupied = images.length;
  const slotsLeft = MAX_REFERENCE_IMAGES - occupied;

  function openPicker(): void {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    onFiles(event.target.files ? [...event.target.files] : []);
    // 重置以支持重复选择同一文件
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragOver(false);
    if (disabled) {
      return;
    }
    onFiles([...event.dataTransfer.files]);
  }

  return (
    <div className="reference-section">
      <div className="reference-header">
        <span className="field-label" id="reference-images-label">
          {t("referenceImages")}
        </span>
        <span className="reference-count">
          {occupied}/{MAX_REFERENCE_IMAGES}
        </span>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 拖拽上传区域，可交互入口在内部按钮 */}
      <div
        className={`reference-dropzone ${dragOver ? "is-dragover" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {occupied === 0 ? (
          <button
            type="button"
            className="reference-empty"
            onClick={openPicker}
            disabled={disabled}
          >
            <span className="reference-empty-icon" aria-hidden="true">
              <ImagePlus size={22} />
            </span>
            <span className="reference-empty-title">{t("dropzoneTitle")}</span>
            <span className="reference-empty-hint">{t("dropzoneHint")}</span>
          </button>
        ) : (
          <>
            {images.map((image) => (
              <div className="reference-thumb" key={image.id}>
                {/* biome-ignore lint/performance/noImgElement: 本地 objectURL 预览无法走 next/image 优化 */}
                <img
                  src={image.previewUrl}
                  alt={image.name}
                  className="reference-thumb-image"
                />
                <button
                  type="button"
                  className="reference-thumb-remove"
                  aria-label={t("removeImage")}
                  disabled={disabled}
                  onClick={() => onRemove(image.id)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
                {image.url === null && (
                  <span
                    className="reference-thumb-uploading"
                    aria-hidden="true"
                  >
                    <LoaderCircle size={16} className="spin" />
                  </span>
                )}
              </div>
            ))}
            {slotsLeft > 0 && !disabled && (
              <button
                type="button"
                className="reference-add-tile"
                onClick={openPicker}
                aria-label={t("uploadMore")}
              >
                <Upload size={18} aria-hidden="true" />
                <span>{t("uploadMore")}</span>
              </button>
            )}
          </>
        )}
        <input
          ref={inputRef}
          id={REFERENCE_INPUT_ID}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="reference-file-input"
          onChange={handleInputChange}
          disabled={disabled || slotsLeft <= 0}
        />
      </div>
    </div>
  );
}

function StudioExamplesPanel({
  examples,
  activeIndex,
  onIndexChange,
  onUseExample,
  panelId = "studio-examples-panel",
  labelledById,
}: Readonly<{
  examples: readonly PosterStudioExample[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onUseExample: (example: PosterStudioExample) => void;
  panelId?: string;
  labelledById?: string;
}>): JSX.Element {
  const t = useTranslations("studio");
  const example = examples[activeIndex] ?? examples[0];
  if (!example) {
    return <div className="studio-panel-empty">{t("noExamples")}</div>;
  }
  const labelFor = (item: PosterStudioExample): string => {
    switch (item.id) {
      case "event":
        return t("exampleEventLabel");
      case "article":
        return t("exampleArticleLabel");
      case "announcement":
        return t("exampleAnnouncementLabel");
      case "vintage-romance":
        return t("exampleVintageRomanceLabel");
      default:
        return item.label;
    }
  };
  const altFor = (item: PosterStudioExample): string => {
    switch (item.id) {
      case "event":
        return t("exampleEventAlt");
      case "article":
        return t("exampleArticleAlt");
      case "announcement":
        return t("exampleAnnouncementAlt");
      case "vintage-romance":
        return t("exampleVintageRomanceAlt");
      default:
        return item.alt;
    }
  };
  const promptFor = (item: PosterStudioExample): string => {
    switch (item.id) {
      case "event":
        return t("exampleEventPrompt");
      case "article":
        return t("exampleArticlePrompt");
      case "announcement":
        return t("exampleAnnouncementPrompt");
      case "vintage-romance":
        return t("exampleVintageRomancePrompt");
      default:
        return item.prompt;
    }
  };
  const copyFor = (item: PosterStudioExample): PosterStudioExample => ({
    ...item,
    label: labelFor(item),
    prompt: promptFor(item),
    alt: altFor(item),
  });
  const displayExample = copyFor(example);
  const exampleLabel = displayExample.label;
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
      id={panelId}
      className="studio-showcase studio-examples-panel"
      role="tabpanel"
      {...(labelledById
        ? { "aria-labelledby": labelledById }
        : { "aria-label": t("examples") })}
    >
      <section
        className="studio-example-carousel"
        aria-label={t("examplePosition", {
          current: activeIndex + 1,
          total: examples.length,
        })}
      >
        <button
          type="button"
          className="studio-example-image-button"
          onClick={() => onUseExample(displayExample)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
          aria-label={t("useExample", { label: exampleLabel })}
        >
          <Image
            src={example.image}
            alt={displayExample.alt}
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
              aria-label={t("previousExample", {
                label: labelFor(examples[previousIndex] ?? example),
              })}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="studio-carousel-arrow studio-carousel-arrow-right"
              onClick={() => move(1)}
              aria-label={t("nextExample", {
                label: labelFor(examples[nextIndex] ?? example),
              })}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </>
        )}
      </section>
      <fieldset
        className="studio-carousel-dots"
        aria-label={t("chooseExample")}
      >
        {examples.map((item, index) => (
          <button
            type="button"
            className={`studio-carousel-dot ${index === activeIndex ? "is-active" : ""}`}
            key={item.image}
            onClick={() => changeIndex(index)}
            aria-label={t("showExample", {
              index: index + 1,
              label: labelFor(item),
            })}
            aria-current={index === activeIndex ? "true" : undefined}
          />
        ))}
      </fieldset>
      <button
        type="button"
        className="studio-example-prompt"
        onClick={() => onUseExample(displayExample)}
        title={displayExample.prompt}
      >
        <span className="studio-example-label">{exampleLabel}</span>
        <span className="studio-example-prompt-text">
          {displayExample.prompt}
        </span>
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
  const t = useTranslations("studio");
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
                ? t("generationTimedOut")
                : t("generationFailed")}
            </strong>
            <p>{generationFailureMessage(generation)}</p>
            {generation.error && <span>{t("noCharge")}</span>}
            {onDismiss && (
              <button type="button" onClick={onDismiss}>
                {t("dismiss")}
              </button>
            )}
          </div>
        ) : (
          <span>{isSubmitted ? t("preparing") : t("generating")}</span>
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
  const t = useTranslations("studio");
  return (
    <fieldset className="studio-history-thumbnails" aria-label={t("history")}>
      {isGenerating && (
        <div
          className="studio-history-thumbnail is-pending"
          role="status"
          aria-label={t("generating")}
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
              ? `${t("generationFailed")} ${index + 1}`
              : `${t("posterPreview")} ${index + 1}`
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
  const t = useTranslations("studio");
  const locale = promptStudioLocale(useLocale());
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
            {t("guestHistory")} ·{" "}
            <a href={localizedPath("/login?next=/%23studio", locale)}>
              {t("signInToKeep")}
            </a>
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
        <p className="eyebrow">{t("noSavedPosters")}</p>
        <p>{t("noSavedPostersBody")}</p>
        {isGuest && <span>{t("guestHistory")}</span>}
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
              {t("retryPoster")}
            </button>
          ) : (
            <button
              type="button"
              className="studio-history-image-button"
              onClick={() => onZoom(selectedPoster.image.url)}
              aria-label={t("fullSizePreview")}
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
            locale,
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
              <ArrowDownToLine size={14} aria-hidden="true" /> {t("download")}
            </button>
            <button
              type="button"
              className="result-action-button"
              onClick={() => onEdit(selectedPoster.generationId)}
            >
              <Pencil size={13} aria-hidden="true" /> {t("editAgain")}
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
          {t("guestHistory")} ·{" "}
          <a href={localizedPath("/login?next=/%23studio", locale)}>
            {t("signInToKeep")}
          </a>
        </p>
      )}
    </div>
  );
}

export function PosterStudio({
  isPro,
  hasPack,
  isGuest,
  initialStyle,
  examples: providedExamples,
}: Props) {
  // 积分包用户与订阅用户同享全档位 / 无水印 / 长保留期
  const paid = isPro || hasPack;
  const t = useTranslations("studio");
  const styles = useTranslations("styles");
  const commonT = useTranslations("common");
  const locale = promptStudioLocale(useLocale());
  const [prompt, setPrompt] = useState("");
  // 生图模式：文生图 / 图生图（参考图）
  const [mode, setMode] = useState<GenerationMode>("text");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [style, setStyle] = useState<PosterStyle>(initialStyle ?? "auto");
  const [aspectRatio, setAspectRatio] = useState<OutputAspect>("2:3");
  const [resolution, setResolution] = useState<Resolution>("1k");
  const [quality, setQuality] = useState<Quality>("low");
  // 默认 1 张；免费用户最大 2 张，Pro 可选 1-4 张
  const [imageCount, setImageCount] = useState<ImageCount>(1);
  const [generations, setGenerations] = useState<GenerationResponse[]>([]);
  const [recentGenerations, setRecentGenerations] = useState<
    GenerationResponse[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  // 积分不足时点击 Generate 的提示（订阅用户余额充足时不触发）
  const [upgradePrompt, setUpgradePrompt] = useState(false);
  const [upgradePromptReason, setUpgradePromptReason] = useState<
    "credits" | "options"
  >("credits");
  const [guestLimitPrompt, setGuestLimitPrompt] = useState(false);
  // 登录用户的积分余额（null = 未加载/加载失败，此时放行由服务端 402 兜底）
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [welcomeGrant, setWelcomeGrant] = useState<{
    amount: number;
    createdAt: string;
  } | null>(null);
  const [welcomeBannerVisible, setWelcomeBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] =
    useState<GenerationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>("examples");
  const [mobileStudioTab, setMobileStudioTab] =
    useState<MobileStudioTab>("create");
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
  const recentRefreshedAt = useRef(0);
  const paramsByGeneration = useRef(new Map<string, GenerationParams>());
  const inputTypeByGeneration = useRef(new Map<string, InputType>());
  const examples = providedExamples ?? STUDIO_JOB_EXAMPLES;

  useEffect(() => {
    if (isGuest) {
      return;
    }
    void fetchAccountStatus().then((data) => {
      if (!data?.signedIn || !data.balance) {
        return;
      }
      setCreditBalance(data.balance.available);
      const welcome = data.balance.grants.find(
        (grant) => grant.source === "welcome",
      );
      if (welcome) {
        setWelcomeGrant({
          amount: welcome.amount,
          createdAt: welcome.createdAt,
        });
      }
    });
  }, [isGuest]);

  useEffect(() => {
    if (!welcomeGrant || isPro) {
      return;
    }
    const fresh =
      Date.now() - new Date(welcomeGrant.createdAt).getTime() <
      24 * 60 * 60 * 1000;
    if (!fresh) {
      return;
    }
    let dismissed = false;
    try {
      dismissed =
        window.localStorage.getItem("welcome-credits-banner") === "dismissed";
    } catch {
      dismissed = false;
    }
    setWelcomeBannerVisible(!dismissed);
  }, [isPro, welcomeGrant]);

  function refreshCreditBalance(): void {
    if (isGuest) {
      return;
    }
    void fetchAccountStatus().then((data) => {
      if (data?.signedIn && data.balance) {
        setCreditBalance(data.balance.available);
      }
    });
  }

  function dismissWelcomeBanner(): void {
    setWelcomeBannerVisible(false);
    try {
      window.localStorage.setItem("welcome-credits-banner", "dismissed");
    } catch {
      // localStorage 不可用时仅本次会话隐藏
    }
  }

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
            ...(params.referenceImageUrls?.length
              ? { referenceImageUrls: params.referenceImageUrls }
              : params.referenceImageUrl
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


  // —— 图生图：参考图上传 ——

  function removeReference(id: string): void {
    setReferenceImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((image) => image.id !== id);
    });
  }

  function clearReferenceImages(): void {
    setReferenceImages((prev) => {
      for (const image of prev) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return [];
    });
    setUploadingCount(0);
  }

  function handleReferenceFiles(files: readonly File[]): void {
    if (files.length === 0) {
      return;
    }
    const slotsLeft = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (slotsLeft <= 0) {
      setError(t("tooManyReferences"));
      return;
    }
    const accepted: File[] = [];
    for (const file of files.slice(0, slotsLeft)) {
      if (!REFERENCE_ACCEPTED_TYPES.has(file.type)) {
        setError(t("fileTypeUnsupported"));
        continue;
      }
      if (file.size > REFERENCE_MAX_FILE_BYTES) {
        setError(t("fileTooLarge"));
        continue;
      }
      accepted.push(file);
    }
    if (files.length > slotsLeft) {
      setError(t("tooManyReferences"));
    }
    if (accepted.length === 0) {
      return;
    }
    setError(null);
    const pending: ReferenceImage[] = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: null,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    }));
    setReferenceImages((prev) => [...prev, ...pending]);
    void uploadReferenceFiles(pending, accepted);
  }

  async function uploadReferenceFiles(
    pending: readonly ReferenceImage[],
    files: readonly File[],
  ): Promise<void> {
    setUploadingCount((count) => count + files.length);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      const raw: unknown = await ky
        .post("/api/uploads/reference", {
          body: formData,
          timeout: 60_000,
        })
        .json();
      const urls =
        typeof raw === "object" &&
        raw !== null &&
        "urls" in raw &&
        Array.isArray(raw.urls)
          ? raw.urls.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
      if (urls.length !== files.length) {
        throw new Error("Upload response was invalid.");
      }
      setReferenceImages((prev) =>
        prev.map((image) => {
          const index = pending.findIndex((entry) => entry.id === image.id);
          const url = index >= 0 ? urls[index] : undefined;
          if (index === -1 || url === undefined) {
            return image;
          }
          URL.revokeObjectURL(image.previewUrl);
          return { ...image, url, previewUrl: url };
        }),
      );
      track("reference_image_added");
    } catch {
      // 上传失败：移除对应占位并提示
      const failedIds = new Set(pending.map((entry) => entry.id));
      setReferenceImages((prev) =>
        prev.filter((image) => {
          if (!failedIds.has(image.id)) {
            return true;
          }
          URL.revokeObjectURL(image.previewUrl);
          return false;
        }),
      );
      setError(t("uploadFailed"));
    } finally {
      setUploadingCount((count) => Math.max(0, count - files.length));
    }
  }

  // 已上传完成（有服务端 URL）的参考图，参与生图请求与积分计算
  const uploadedReferenceUrls = useMemo(
    () =>
      referenceImages
        .map((image) => image.url)
        .filter((url): url is string => url !== null),
    [referenceImages],
  );
  // 图生图模式不暴露品质选择：high 及以上一律按 medium 计费与提交
  const effectiveQuality: Quality =
    mode === "image" &&
    (quality === "high" || quality === "xhigh" || quality === "max")
      ? "medium"
      : quality;

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
      setError(t("refreshFailed"));
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
        (generation) =>
          !currentIds.has(generation.id) &&
          !dismissedIds.current.has(generation.id),
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
    setMobileStudioTab("create");
    promptFieldRef.current?.focus();
    track("studio_example_select");
  }

  function resetStudio(): void {
    dismissedIds.current.clear();
    generationById.current.clear();
    setGenerations([]);
    setPrompt("");
    setActiveTab("examples");
    setMobileStudioTab("create");
    setActiveExampleIndex(0);
    setSelectedHistoryKey(null);
    setStyle("auto");
    setAspectRatio("2:3");
    setResolution("1k");
    setQuality("low");
    setImageCount(1);
    setMode("text");
    clearReferenceImages();
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
      refreshRecent();
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
      setError(t("restoreFailed"));
    }
  }

  // 图片走签名 URL（1 小时有效），页面长时间停留后旧链接会 403 裂图。
  // 用户回到页面时按 5 分钟节流重取一次历史，既刷新链接又避免请求风暴。
  function refreshRecent(): void {
    if (Date.now() - recentRefreshedAt.current < 5 * 60 * 1_000) {
      return;
    }
    recentRefreshedAt.current = Date.now();
    void recoverRecent();
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
    // 参考图来源：显式 overrides（URL 管线 / 内容编辑）优先，否则取图生图面板已上传项
    const generationReferenceUrls = overrides
      ? [
          ...new Set<string>([
            ...(overrides.referenceImageUrls ?? []),
            ...(overrides.referenceImageUrl
              ? [overrides.referenceImageUrl]
              : []),
          ]),
        ].slice(0, MAX_REFERENCE_IMAGES)
      : mode === "image"
        ? uploadedReferenceUrls
        : [];
    const generationStyle = overrides?.style ?? style;
    const generationAspectRatio = overrides?.aspectRatio ?? aspectRatio;
    const generationResolution = overrides?.resolution ?? resolution;
    const generationQuality = overrides?.quality ?? effectiveQuality;
    const generationImageCount = overrides?.imageCount ?? imageCount;
    // 按钮默认启用（对爬虫友好：HTML 中不显示 disabled），无输入时在提交前校验提示
    if (generationPrompt.length < 3) {
      setError(t("describeBrief"));
      return;
    }
    // 图生图模式必须有至少一张已上传完成的参考图
    if (
      mode === "image" &&
      !overrides &&
      generationReferenceUrls.length === 0
    ) {
      setError(
        uploadingCount > 0 ? t("referenceUploading") : t("needReferenceImage"),
      );
      return;
    }
    // 免费用户选了锁定档位：不发起请求，引导开通会员
    if (!paid && needsPro) {
      upgradePreviousFocus.current = generateButtonRef.current;
      setUpgradePromptReason("options");
      setUpgradePrompt(true);
      return;
    }
    // 积分不足：不发起请求，引导购买积分包（余额未加载时放行，服务端 402 兜底）
    if (insufficientCredits) {
      upgradePreviousFocus.current = generateButtonRef.current;
      setUpgradePromptReason("credits");
      setUpgradePrompt(true);
      return;
    }
    if (isSubmitting) {
      return;
    }
    if (!paid && anyWorking) {
      setError(t("waitForCurrent"));
      return;
    }
    setActiveTab("history");
    setMobileStudioTab("results");
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
      ...(generationReferenceUrls.length > 0
        ? { referenceImageUrls: generationReferenceUrls }
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
            siteLocale: locale,
            ...(generationReferenceUrls.length > 0
              ? { referenceImageUrls: generationReferenceUrls }
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
      // 乐观扣减本地余额展示；下次 status 拉取会校正
      if (paid && !isGuest) {
        setCreditBalance((current) =>
          current === null
            ? null
            : Math.max(
                0,
                current -
                  batchCreditCost(
                    generationResolution,
                    generationQuality,
                    generationImageCount,
                    generationReferenceUrls.length,
                  ),
              ),
        );
      }
    } catch (submitError) {
      setPendingSubmission(null);
      const safetyFailure = isPromptSafetyFailure(submitError);
      const limitKind = generationLimitKind(submitError);
      if (safetyFailure) {
        applyGeneration({
          ...submission,
          status: "failed",
          progress: 100,
          error: t("safetyReviewFailed"),
        });
      } else if (limitKind === "guest") {
        guestLimitPreviousFocus.current = generateButtonRef.current;
        setGuestLimitPrompt(true);
      } else if (limitKind === "credits") {
        upgradePreviousFocus.current = generateButtonRef.current;
        setUpgradePromptReason("credits");
        setUpgradePrompt(true);
        refreshCreditBalance();
      } else if (submitError instanceof HTTPError) {
        setError(t("startFailed"));
      } else if (submitError instanceof Error) {
        setError(t("startFailed"));
      } else {
        setError(t("startFailed"));
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
  // 免费积分用户：1K + low/medium 可用；选了 2K/4K 或 high 及以上质量时提示升级。
  // 积分包用户（paid）与订阅用户解锁全部档位。
  // 余额未加载（null）时放行，由服务端 INSUFFICIENT_CREDITS 402 兜底。
  // 积分预估：图生图按已上传完成的参考图张数加价（每张 +1）
  const creditCost = batchCreditCost(
    resolution,
    effectiveQuality,
    imageCount,
    mode === "image" ? uploadedReferenceUrls.length : 0,
  );
  const needsPro =
    !paid &&
    !isGuest &&
    (resolution !== "1k" ||
      effectiveQuality === "high" ||
      effectiveQuality === "xhigh" ||
      effectiveQuality === "max");
  const insufficientCredits =
    !paid &&
    !isGuest &&
    !needsPro &&
    creditBalance !== null &&
    creditCost > creditBalance;
  const action = generationAction(paid, isSubmitting, anyWorking);
  const actionLabel =
    action.label === "Sending..."
      ? t("sending")
      : action.label === "Create another"
        ? t("createAnother")
        : action.label === "Current poster is generating"
          ? t("currentGenerating")
          : t("generate");
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
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 id="studio-heading">{t("heading")}</h2>
        </div>
        <span className="studio-count">{t("count")}</span>
      </div>

      {welcomeBannerVisible && (
        <div className="welcome-credits-banner" role="status">
          <Sparkles size={16} />
          <p>{t("welcomeBanner", { credits: welcomeGrant?.amount ?? 30 })}</p>
          <button
            type="button"
            className="text-button"
            onClick={dismissWelcomeBanner}
          >
            {t("dismissBanner")}
          </button>
        </div>
      )}

      <MobileStudioTabs
        activeTab={mobileStudioTab}
        onChange={(tab) => {
          setMobileStudioTab(tab);
          if (tab === "results") {
            setActiveTab("history");
          }
        }}
      />

      <div className="studio-grid">
        <div
          id="studio-mobile-create-panel"
          className={`studio-controls ${mobileStudioTab === "create" ? "is-mobile-active" : ""}`}
          role="tabpanel"
          aria-labelledby="studio-mobile-create-tab"
        >
          <ModeSwitch
            mode={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
              // 图生图参数只有比例+分辨率：默认匹配原图、1 张、风格 auto；
              // 切回文生图时把比例从 auto 还原为可用值
              if (next === "image") {
                setAspectRatio("auto");
                setStyle("auto");
                setImageCount(1);
              } else {
                setAspectRatio((current) =>
                  current === "auto" ? "2:3" : current,
                );
              }
              track(next === "image" ? "image_mode_on" : "image_mode_off");
            }}
          />
          {mode === "image" && (
            <ReferenceUploader
              images={referenceImages}
              disabled={isSubmitting}
              onFiles={handleReferenceFiles}
              onRemove={removeReference}
            />
          )}
          <label className="field-label" htmlFor="poster-prompt">
            {mode === "image" ? t("describeEditLabel") : t("describeIdea")}
          </label>
          <textarea
            ref={promptFieldRef}
            id="poster-prompt"
            className="prompt-field"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={handlePaste}
            placeholder={
              mode === "image"
                ? t("describeEditPrompt")
                : t("promptPlaceholder")
            }
            maxLength={1500}
            rows={5}
            disabled={isSubmitting}
          />
          <div className="field-hint">
            <span>{t("inputTypes")}</span>
            <span>{prompt.length}/1500</span>
          </div>

          <fieldset className="control-block">
            <legend className="field-label">{t("outputSettings")}</legend>
            {mode === "image" ? (
              // 图生图：只暴露比例（含匹配原图）与分辨率，一行两等分撑满
              <div className="studio-options studio-options--image">
                <div className="option-select">
                  <span>{t("outputAspect")}</span>
                  <TierSelect
                    label={t("aspectRatio")}
                    value={aspectRatio}
                    onChange={(next) => {
                      if (next === "auto" || isAspectRatio(next)) {
                        setAspectRatio(next);
                        setUpgradePrompt(false);
                      }
                    }}
                    disabled={isSubmitting}
                    options={[
                      {
                        value: "auto",
                        label: t("matchReference"),
                        locked: false,
                      },
                      ...ASPECT_RATIOS.map((option) => ({
                        value: option,
                        label: `${t(ASPECT_LABEL_KEYS[option])} (${option})`,
                        locked: false,
                      })),
                    ]}
                  />
                </div>
                <div className="option-select">
                  <span>{t("outputResolution")}</span>
                  <TierSelect
                    label={t("resolution")}
                    value={resolution}
                    onChange={(next) => {
                      if (RESOLUTIONS.some((option) => option === next)) {
                        setResolution(next as Resolution);
                        setUpgradePrompt(false);
                      }
                    }}
                    disabled={isSubmitting}
                    options={RESOLUTIONS.map((option) => ({
                      value: option,
                      label: t(RESOLUTION_LABEL_KEYS[option]),
                      locked: option !== "1k" && !paid,
                    }))}
                  />
                </div>
              </div>
            ) : (
            <div className="studio-options">
              <div className="option-select option-select--wide">
                <span>{t("output")}</span>
                <OutputSettingsSelect
                  aspectRatio={aspectRatio === "auto" ? "2:3" : aspectRatio}
                  resolution={resolution}
                  quality={quality}
                  tier={paid ? "pro" : isGuest ? "guest" : "free"}
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
                <span>{t("artDirection")}</span>
                <TierSelect
                  label={t("artDirection")}
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
                    label: styles(option),
                    locked: false,
                  }))}
                />
              </div>
              <div className="option-select">
                <span>{t("images")}</span>
                <TierSelect
                  label={t("images")}
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
                    label: t("imageCount", { count }),
                    locked: isGuest ? count !== GUEST_MAX_IMAGES : false,
                  }))}
                />
              </div>
            </div>
            )}
          </fieldset>
          {!isGuest && (
            <p className="credit-estimate">
              {t("creditEstimate", { credits: creditCost })}
            </p>
          )}
          {isGuest && (
            <p className="pro-note">
              <LockKeyhole size={14} />
              {` ${t("guestsQuota")}`}
            </p>
          )}

          <button
            ref={generateButtonRef}
            className="generate-button"
            type="button"
            onClick={() => {
              // 免费用户选了锁定档位，或积分不足：先弹提示，不做任何后续动作
              if (needsPro) {
                upgradePreviousFocus.current = generateButtonRef.current;
                setUpgradePromptReason("options");
                setUpgradePrompt(true);
              } else if (insufficientCredits) {
                upgradePreviousFocus.current = generateButtonRef.current;
                setUpgradePromptReason("credits");
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
            <Sparkles size={18} /> {actionLabel}
          </button>
          <p className="ai-disclosure">
            {t("aiDisclosure")}{" "}
            <a href={localizedPath("/ai-policy", locale)}>{t("readPolicy")}</a>
          </p>
          {error && (
            <p className="error-message" role="alert">
              <CircleAlert size={16} /> {error}
            </p>
          )}
        </div>

        <div
          id="studio-mobile-results-panel"
          className={`studio-results ${mobileStudioTab === "results" ? "is-mobile-active" : ""}`}
          role="tabpanel"
          aria-labelledby="studio-mobile-results-tab"
        >
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
                  {t("startNewBrief")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="studio-mobile-examples">
        <StudioExamplesPanel
          examples={examples}
          activeIndex={activeExampleIndex}
          onIndexChange={setActiveExampleIndex}
          onUseExample={chooseExample}
          panelId="studio-mobile-examples-panel"
        />
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
            aria-label={t("closePreview")}
            onClick={() => setGuestLimitPrompt(false)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">{t("freeAccount")}</p>
          <h3 id="guest-limit-title">{t("guestLimitTitle")}</h3>
          <p className="modal-note" id="guest-limit-note">
            {t("guestLimitBody")}
          </p>
          <LoginForm
            next={localizedPath("/#studio", locale)}
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
            aria-label={t("closePreview")}
            onClick={() => setUpgradePrompt(false)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">{t("proFeature")}</p>
          <h3 id="upgrade-title">
            {upgradePromptReason === "credits"
              ? t("insufficientCreditsTitle")
              : t("proOptions")}
          </h3>
          <p className="modal-note" id="upgrade-note">
            {upgradePromptReason === "credits"
              ? t("insufficientCreditsBody")
              : t("proOptionsBody")}
          </p>
          <div className="modal-actions">
            <button
              className="outline-button"
              type="button"
              onClick={() => setUpgradePrompt(false)}
            >
              {t("maybeLater")}
            </button>
            <a
              className="solid-button"
              href={
                upgradePromptReason === "credits"
                  ? `${localizedPath("/pricing", locale)}#credit-packs`
                  : localizedPath("/pricing", locale)
              }
            >
              {upgradePromptReason === "credits"
                ? t("getCredits")
                : t("upgradeToPro")}
            </a>
          </div>
        </div>
      </dialog>
      <dialog
        ref={lightboxDialogRef}
        className="lightbox"
        aria-label={t("fullSizePreview")}
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
              aria-label={t("closePreview")}
              onClick={() => setLightbox(null)}
            >
              <X size={20} />
            </button>
            <Image
              src={lightbox}
              alt={t("posterPreview")}
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
            aria-label={t("closeEditContent")}
            onClick={() => setEditContentId(null)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">{t("editContent")}</p>
          <h3 id="edit-content-title">{t("updatePosterCopy")}</h3>
          <div className="brief-form">
            <label>
              <span>{t("headline")}</span>
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
              <span>{t("subtitle")}</span>
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
              <legend>{t("keyPoints")}</legend>
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
              <span>{t("optionalCta")}</span>
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
              {commonT("cancel")}
            </button>
            <button
              type="button"
              className="solid-button"
              onClick={updateEditedContent}
            >
              {t("updatePoster")}
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
