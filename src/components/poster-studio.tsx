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
  type JSX,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { batchCreditCost } from "@/lib/domain/credits";
import {
  flattenRecentPosterImages,
  isVisibleGuestHistory,
} from "@/lib/domain/generation-history";
import {
  generationAction,
  generationPollDelay,
  mergeGenerationResponse,
} from "@/lib/domain/generation-progress";
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
  isResolution,
  type PosterStyle,
  type Quality,
  type Resolution,
  recentGenerationsSchema,
  styleLabels,
} from "@/lib/domain/poster";
import {
  POSTER_EXAMPLES,
  type PosterExample,
} from "@/lib/domain/poster-examples";
import { ArtDirectionPicker } from "./art-direction-picker";
import { GenerationProgressCard } from "./generation-progress-card";

type Props = Readonly<{ isPro: boolean; isGuest: boolean }>;

const FEATURED_EXAMPLE_STYLES: PosterStyle[] = [
  "movie",
  "minimal",
  "vintage",
  "neon",
];

// 免费档位：1K / low / 最多 2 张；免费用户选了更高档位才显示锁，
// 点击 Generate 时提示升级，不发起请求
const FREE_RESOLUTION: Resolution = "1k";
const FREE_QUALITY: Quality = "low";
const FREE_MAX_IMAGES = 2;
const GUEST_MAX_IMAGES = 1;

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
    if (!option || option.locked) {
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
              aria-disabled={option.locked}
              disabled={option.locked}
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

const PENDING_GENERATIONS_KEY = "ttp_pending_generations";

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

function isGuestLimitReached(error: unknown): boolean {
  if (!(error instanceof HTTPError)) {
    return false;
  }
  const body: unknown = error.data;
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "GUEST_LIMIT_REACHED"
  );
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

function RecentPosterTile({
  poster,
  index,
  onZoom,
  onDownload,
  onRetry,
}: Readonly<{
  poster: ReturnType<typeof flattenRecentPosterImages>[number];
  index: number;
  onZoom: (url: string) => void;
  onDownload: (url: string, filename: string) => void;
  onRetry: () => void;
}>): JSX.Element {
  const [loadError, setLoadError] = useState(false);
  const filename = `text-to-poster-history-${index + 1}.png`;
  const expiry = poster.expiresAt
    ? ` Available until ${new Date(poster.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`
    : "";
  const accessibleDescription = `${poster.prompt}.${expiry}`;
  return (
    <li className="recent-poster-tile">
      <div className="recent-poster-frame" title={accessibleDescription}>
        {loadError ? (
          <button
            type="button"
            className="recent-poster-retry"
            onClick={() => {
              setLoadError(false);
              onRetry();
            }}
            aria-label="Couldn’t load recent poster. Retry"
          >
            Couldn’t load poster. Retry
          </button>
        ) : (
          <button
            type="button"
            className="recent-poster-image"
            onClick={() => onZoom(poster.image.url)}
            aria-label={`View recent poster ${index + 1}. ${accessibleDescription}`}
          >
            <Image
              src={poster.image.url}
              alt={poster.image.alt}
              width={320}
              height={400}
              sizes="8.5rem"
              onError={() => setLoadError(true)}
            />
          </button>
        )}
        {!loadError && (
          <button
            type="button"
            className="result-download-overlay"
            onClick={() => onDownload(poster.image.url, filename)}
            aria-label={`Download recent poster ${index + 1}`}
          >
            <ArrowDownToLine size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

function RecentPosterStrip({
  generations,
  isGuest,
  onZoom,
  onDownload,
  onRetry,
}: Readonly<{
  generations: readonly GenerationResponse[];
  isGuest: boolean;
  onZoom: (url: string) => void;
  onDownload: (url: string, filename: string) => void;
  onRetry: (generationId: string) => void;
}>): JSX.Element | null {
  const posters = flattenRecentPosterImages(generations);
  if (posters.length === 0) {
    return null;
  }
  return (
    <section
      className="recent-posters"
      aria-labelledby="recent-posters-heading"
    >
      <div className="recent-posters-head">
        <div className="recent-posters-title">
          <p className="eyebrow" id="recent-posters-heading">
            Recent posters
          </p>
          <span className="recent-posters-count">{posters.length}</span>
        </div>
        <div className="recent-posters-meta">
          {isGuest && <span>Only this browser · saved for 24 hours</span>}
          {isGuest && (
            <a href="/login?next=/%23studio">Sign in to keep 7 days</a>
          )}
        </div>
      </div>
      <ul className="recent-posters-track" aria-label="Recent poster images">
        {posters.map((poster, index) => (
          <RecentPosterTile
            key={`${poster.generationId}-${poster.image.id}`}
            poster={poster}
            index={index}
            onZoom={onZoom}
            onDownload={onDownload}
            onRetry={() => onRetry(poster.generationId)}
          />
        ))}
      </ul>
    </section>
  );
}

export function PosterStudio({ isPro, isGuest }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<PosterStyle>("auto");
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
  const [guestLimitPrompt, setGuestLimitPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmission, setPendingSubmission] =
    useState<GenerationResponse | null>(null);
  const [connectionFailures, setConnectionFailures] = useState<
    Record<string, number>
  >({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const guestLimitDialogRef = useRef<HTMLDialogElement>(null);
  const guestLimitCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxDialogRef = useRef<HTMLDialogElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const guestLimitPreviousFocus = useRef<HTMLElement | null>(null);
  const lightboxPreviousFocus = useRef<HTMLElement | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pollAttempts = useRef(new Map<string, number>());
  const pollingIds = useRef(new Set<string>());
  const advanceFailures = useRef(new Map<string, number>());
  const advancingIds = useRef(new Set<string>());
  const workingIds = useRef(new Set<string>());
  const activeIds = useRef(new Set<string>());
  const trackedIds = useRef(new Set<string>());
  const dismissedIds = useRef(new Set<string>());
  const generationById = useRef(new Map<string, GenerationResponse>());
  const generationKeys = useRef(new Map<string, string>());
  const submissionSequence = useRef(0);

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

  function syncConnectionFailures(id: string): void {
    const failures = Math.max(
      pollAttempts.current.get(id) ?? 0,
      advanceFailures.current.get(id) ?? 0,
    );
    setConnectionFailures((prev) =>
      prev[id] === failures ? prev : { ...prev, [id]: failures },
    );
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
      syncConnectionFailures(id);
      applyGeneration(parsed.data);
      if (isTerminalStatus(parsed.data.status)) {
        trackGenerationOutcome(id, parsed.data.status);
      }
    } catch {
      // 主轮询继续重试，服务端恢复后会自动完成；连续失败给出提示
      const failures = (advanceFailures.current.get(id) ?? 0) + 1;
      advanceFailures.current.set(id, failures);
      syncConnectionFailures(id);
    } finally {
      advancingIds.current.delete(id);
    }
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

  function resetStudio(): void {
    dismissedIds.current.clear();
    generationById.current.clear();
    generationKeys.current.clear();
    setGenerations([]);
    setPrompt("");
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
      syncConnectionFailures(id);
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
      // 记录已被删除（404）：停止轮询并清理本地状态，避免无限请求已删除的 generation
      if (pollError instanceof HTTPError && pollError.response.status === 404) {
        activeIds.current.delete(id);
        workingIds.current.delete(id);
        generationById.current.delete(id);
        pollAttempts.current.delete(id);
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
      // 无论什么错误都继续轮询（带退避），避免页面永久停在“生成中”
      const delay = recordPollFailure(id);
      syncConnectionFailures(id);
      if (pollError instanceof TimeoutError) {
        schedulePoll(id, delay);
        return;
      }
      schedulePoll(id, delay);
    } finally {
      pollingIds.current.delete(id);
    }
  }

  async function generate(): Promise<void> {
    setError(null);
    setUpgradePrompt(false);
    setGuestLimitPrompt(false);
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
    const submissionKey = `pending-submission-${++submissionSequence.current}`;
    const submission: GenerationResponse = {
      id: submissionKey,
      status: "submitted",
      progress: 0,
      aspectRatio,
      prompt: prompt.trim(),
      createdAt: new Date().toISOString(),
      images: [],
      imageCount,
      creditsReserved: 0,
    };
    setPendingSubmission(submission);
    track("generation_started");
    try {
      const raw: unknown = await ky
        .post("/api/generations", {
          json: { prompt, style, aspectRatio, resolution, quality, imageCount },
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
      moveCompletedGenerationsToRecent();
      generationKeys.current.set(id, submissionKey);
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
      if (isGuestLimitReached(submitError)) {
        guestLimitPreviousFocus.current = generateButtonRef.current;
        setGuestLimitPrompt(true);
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
  const currentGenerationIds = new Set(
    generations.map((generation) => generation.id),
  );
  const visibleRecentGenerations = recentGenerations.filter(
    (generation) => !currentGenerationIds.has(generation.id),
  );
  const visibleGenerations = pendingSubmission
    ? [pendingSubmission, ...generations]
    : generations;

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
            disabled={isSubmitting}
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
              disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                ? " Guests can make up to 4 generations per UTC day. Each run creates 1 watermarked 1K poster."
                : " Free runs are 1K, watermarked, and include up to 2 posters. Pro unlocks full quality and 4 posters."}
            </p>
          )}

          <button
            ref={generateButtonRef}
            className="generate-button"
            type="button"
            onClick={() => void generate()}
            disabled={action.disabled}
          >
            <Sparkles size={18} /> {action.label}
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

        <div className="studio-results">
          {generations.length === 0 && !pendingSubmission && (
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
          {visibleGenerations.map((generation) => {
            const submitting = generation.id === pendingSubmission?.id;
            const working =
              generation.status === "submitted" ||
              generation.status === "processing";
            const hasResult =
              generation.status === "succeeded" ||
              generation.status === "partially_succeeded";
            return (
              <div
                className="generation-block"
                id={
                  submitting
                    ? "generation-pending-submission"
                    : `generation-${generation.id}`
                }
                key={generationKeys.current.get(generation.id) ?? generation.id}
              >
                {(submitting || working || hasResult) && (
                  <GenerationProgressCard
                    generation={generation}
                    isGuest={isGuest}
                    isSubmitting={submitting}
                    connectionFailures={connectionFailures[generation.id] ?? 0}
                    onZoom={openLightbox}
                    onDownload={downloadTrackedImage}
                    onRetry={(id) => void retryGenerationImage(id)}
                  />
                )}
                {!working && !hasResult && (
                  <div className="failure-card">
                    <CircleAlert size={22} />
                    <p>
                      Nothing was charged for this run. Try a shorter, more
                      visual brief.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        dismissedIds.current.add(generation.id);
                        setGenerations((prev) =>
                          prev.filter((g) => g.id !== generation.id),
                        );
                        writePendingGenerationIds(
                          readPendingGenerationIds().filter(
                            (id) => id !== generation.id,
                          ),
                        );
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {visibleRecentGenerations.length > 0 && (
            <RecentPosterStrip
              generations={visibleRecentGenerations}
              isGuest={isGuest}
              onZoom={openLightbox}
              onDownload={downloadTrackedImage}
              onRetry={(id) => void retryGenerationImage(id)}
            />
          )}
          {generations.length > 0 && !anyWorking && (
            <button
              className="reset-button"
              type="button"
              onClick={resetStudio}
            >
              Start a new brief
            </button>
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
            aria-label="Close upgrade prompt"
            onClick={() => setGuestLimitPrompt(false)}
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Guest limit</p>
          <h3 id="guest-limit-title">
            Today&apos;s guest generations are used up.
          </h3>
          <p className="modal-note" id="guest-limit-note">
            Failed generations do not count. Upgrade to Pro to keep creating
            today, or come back tomorrow. Your quota resets at 00:00 UTC.
          </p>
          <div className="modal-actions">
            <button
              className="outline-button"
              type="button"
              onClick={() => setGuestLimitPrompt(false)}
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
    </section>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
