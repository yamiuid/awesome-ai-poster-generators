"use client";

import { Check, CircleAlert, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import {
  BRIEF_CHAR_LIMITS,
  type BriefFields,
  buildBriefPrompt,
  normalizeBriefFields,
} from "@/lib/domain/brief";
import {
  type PageUnderstanding,
  type UrlAnalyzeEvent,
  urlAnalyzeEventSchema,
} from "@/lib/domain/url-analyze";

const EMPTY_BRIEF_FIELDS: BriefFields = {
  headline: "",
  subtitle: "",
  points: ["", "", ""],
  cta: "",
};

const USER_STEPS = [{ id: 1 }, { id: 2 }, { id: 3 }] as const;

type UserStepId = (typeof USER_STEPS)[number]["id"];
type StepStatus = "pending" | "running" | "done" | "error" | "interactive";
type StepState = Readonly<{ status: StepStatus; error?: string }>;

type Step1Data = Readonly<{
  url?: string;
  domain?: string;
  finalUrl?: string;
  contentType?: string;
  byteLength?: number;
  title?: string;
  description?: string;
  siteName?: string;
  ogImage?: string;
  favicon?: string;
  headings?: readonly string[];
  excerpt?: string;
  cleanedLength?: number;
}>;

type Props = Readonly<{
  open: boolean;
  url: string;
  onClose: () => void;
  onGenerate: (prompt: string, referenceImageUrl?: string) => void;
}>;

function initialSteps(): Record<UserStepId, StepState> {
  return {
    1: { status: "pending" },
    2: { status: "pending" },
    3: { status: "pending" },
  };
}

function granularToUser(step: number): UserStepId {
  if (step >= 1 && step <= 4) {
    return 1;
  }
  if (step === 5) {
    return 2;
  }
  return 3;
}

function track(name: string): void {
  window.umami?.track(name);
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepIcon({ status }: Readonly<{ status: StepStatus }>): JSX.Element {
  if (status === "done") {
    return <Check size={14} aria-hidden="true" />;
  }
  if (status === "running") {
    return <span className="url-step-spinner" aria-hidden="true" />;
  }
  if (status === "error") {
    return <CircleAlert size={14} aria-hidden="true" />;
  }
  if (status === "interactive") {
    return <Check size={14} aria-hidden="true" />;
  }
  return <span className="url-step-dot" aria-hidden="true" />;
}

function PipelinePointInput({
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

export function UrlPipelineModal({
  open,
  url,
  onClose,
  onGenerate,
}: Props): JSX.Element {
  const t = useTranslations("studio");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeStepRef = useRef<UserStepId>(1);
  const [steps, setSteps] =
    useState<Record<UserStepId, StepState>>(initialSteps);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<PageUnderstanding | null>(null);
  const [briefFields, setBriefFields] =
    useState<BriefFields>(EMPTY_BRIEF_FIELDS);
  const [editingBrief, setEditingBrief] = useState(false);
  const [activeStep, setActiveStep] = useState<UserStepId>(1);
  const [streamError, setStreamError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleAnalyzeEvent = useCallback((event: UrlAnalyzeEvent): void => {
    if (event.status === "error") {
      const message =
        typeof event.data === "object" &&
        event.data !== null &&
        "message" in event.data
          ? String((event.data as { message?: unknown }).message)
          : "Something went wrong while processing this page.";
      const userStep = granularToUser(event.step || 1);
      setSteps((prev) => ({
        ...prev,
        [userStep]: { status: "error", error: message },
      }));
      setStreamError(message);
      track("url_pipeline_error");
      return;
    }
    if (event.step === 0 && event.status === "complete") {
      const data = event.data as { brief?: unknown } | undefined;
      const fields = normalizeBriefFields(data?.brief);
      if (fields) {
        setBriefFields(fields);
        setSteps((prev) => ({ ...prev, 3: { status: "interactive" } }));
        setActiveStep(3);
        track("url_pipeline_complete");
      }
      return;
    }
    if (event.status === "running") {
      const userStep = granularToUser(event.step);
      setSteps((prev) => ({ ...prev, [userStep]: { status: "running" } }));
      setActiveStep(userStep);
      return;
    }
    if (event.status === "done") {
      switch (event.step) {
        case 1: {
          const data = event.data as { url: string; domain: string };
          setStep1Data((prev) => ({
            ...prev,
            url: data.url,
            domain: data.domain,
          }));
          break;
        }
        case 2: {
          const data = event.data as {
            status: number;
            contentType: string;
            byteLength: number;
            finalUrl: string;
          };
          setStep1Data((prev) => ({
            ...prev,
            contentType: data.contentType,
            byteLength: data.byteLength,
            finalUrl: data.finalUrl,
          }));
          break;
        }
        case 3: {
          const data = event.data as Step1Data;
          setStep1Data((prev) => ({
            ...prev,
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.description !== undefined
              ? { description: data.description }
              : {}),
            ...(data.siteName !== undefined ? { siteName: data.siteName } : {}),
            ...(data.ogImage !== undefined ? { ogImage: data.ogImage } : {}),
            ...(data.favicon !== undefined ? { favicon: data.favicon } : {}),
            ...(data.headings !== undefined ? { headings: data.headings } : {}),
          }));
          break;
        }
        case 4: {
          const data = event.data as { length: number; excerpt: string };
          setStep1Data((prev) => ({
            ...prev,
            excerpt: data.excerpt,
            cleanedLength: data.length,
          }));
          setSteps((prev) => ({ ...prev, 1: { status: "done" } }));
          break;
        }
        case 5:
          setStep2Data(event.data as PageUnderstanding);
          setSteps((prev) => ({ ...prev, 2: { status: "done" } }));
          break;
        case 6: {
          const fields = normalizeBriefFields(event.data);
          if (fields) {
            setBriefFields(fields);
          }
          setSteps((prev) => ({ ...prev, 3: { status: "done" } }));
          break;
        }
        default:
          break;
      }
    }
  }, []);

  const startPipeline = useCallback(() => {
    cancelledRef.current = false;
    setSteps(initialSteps());
    setStep1Data(null);
    setStep2Data(null);
    setBriefFields(EMPTY_BRIEF_FIELDS);
    setEditingBrief(false);
    setStreamError(null);
    setActiveStep(1);
    track("url_pipeline_start");

    void (async () => {
      try {
        const response = await fetch("/api/url/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok || !response.body) {
          throw new Error("The page pipeline could not start.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let newlineIndex = buffer.indexOf("\n");
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          newlineIndex = buffer.indexOf("\n");
          while (newlineIndex >= 0) {
            const rawLine = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
            if (!rawLine) {
              continue;
            }
            let parsedEvent: unknown;
            try {
              parsedEvent = JSON.parse(rawLine);
            } catch {
              continue;
            }
            const event = urlAnalyzeEventSchema.safeParse(parsedEvent);
            if (event.success) {
              handleAnalyzeEvent(event.data);
            }
          }
        }
      } catch (error) {
        if (!cancelledRef.current) {
          const message =
            error instanceof Error ? error.message : t("pipelineError");
          setStreamError(message);
          const currentStep = activeStepRef.current;
          setSteps((prev) => ({
            ...prev,
            [currentStep]: { status: "error", error: message },
          }));
          track("url_pipeline_error");
        }
      }
    })();
  }, [url, handleAnalyzeEvent, t]);

  useEffect(() => {
    if (!open) {
      return;
    }
    startPipeline();
    return () => {
      cancelledRef.current = true;
    };
  }, [open, startPipeline]);

  function handleGenerate(): void {
    track("url_brief_confirmed");
    setEditingBrief(false);
    // 关闭弹窗，由页面原有结果卡继续展示生成进度与下载
    onGenerate(buildBriefPrompt(briefFields), step1Data?.ogImage);
    onClose();
  }

  function renderActiveStep(): JSX.Element {
    switch (activeStep) {
      case 1:
        return (
          <div className="pipeline-content-card">
            <p className="eyebrow">{t("readPage")}</p>
            {step1Data?.domain && (
              <p className="pipeline-domain">🔗 {step1Data.domain}</p>
            )}
            {step1Data?.title && <h4>{step1Data.title}</h4>}
            {step1Data?.ogImage && (
              // biome-ignore lint/performance/noImgElement: arbitrary remote page images
              <img
                className="pipeline-og-image"
                src={step1Data.ogImage}
                alt=""
              />
            )}
            {step1Data?.description && (
              <p className="pipeline-note">{step1Data.description}</p>
            )}
            {step1Data?.excerpt && (
              <blockquote className="pipeline-excerpt">
                “{step1Data.excerpt}”
              </blockquote>
            )}
            {step1Data?.excerpt && (
              <p className="pipeline-meta">
                {step1Data.contentType} · {formatBytes(step1Data.byteLength)} ·{" "}
                {step1Data.cleanedLength?.toLocaleString()} {t("characters")}
              </p>
            )}
            {!step1Data?.excerpt && (
              <p className="pipeline-note">{t("readingPage")}</p>
            )}
          </div>
        );
      case 2:
        return (
          <div className="pipeline-content-card">
            <p className="eyebrow">{t("understandContent")}</p>
            {step2Data ? (
              <div className="understanding-card">
                <p className="understanding-tag">{step2Data.pageType}</p>
                <h4>{step2Data.topic}</h4>
                <p className="pipeline-note">{step2Data.primaryMessage}</p>
                {step2Data.audience && (
                  <p className="pipeline-meta">
                    {t("audience")} · {step2Data.audience}
                  </p>
                )}
                {step2Data.keyPoints.length > 0 && (
                  <ul className="understanding-points">
                    {step2Data.keyPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="pipeline-note">{t("understandingContent")}</p>
            )}
          </div>
        );
      case 3:
        return (
          <div className="pipeline-content-card">
            <p className="eyebrow">{t("posterCopy")}</p>
            {steps[3]?.status === "running" ? (
              <p className="pipeline-note">{t("writingCopy")}</p>
            ) : (
              <>
                {!editingBrief ? (
                  <div className="brief-preview">
                    <div className="brief-preview-copy">
                      <h3>{briefFields.headline || t("untitledPoster")}</h3>
                      {briefFields.subtitle && (
                        <p className="brief-subtitle">{briefFields.subtitle}</p>
                      )}
                      {briefFields.points.some(Boolean) && (
                        <ul className="brief-points">
                          {briefFields.points.filter(Boolean).map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      )}
                      {briefFields.cta && (
                        <p className="brief-cta">{briefFields.cta}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="brief-edit-button"
                      onClick={() => setEditingBrief(true)}
                    >
                      {t("edit")}
                    </button>
                  </div>
                ) : (
                  <div className="brief-form">
                    <label>
                      <span>{t("headline")}</span>
                      <input
                        type="text"
                        value={briefFields.headline}
                        maxLength={BRIEF_CHAR_LIMITS.headline}
                        onChange={(event) =>
                          setBriefFields({
                            ...briefFields,
                            headline: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{t("subtitle")}</span>
                      <input
                        type="text"
                        value={briefFields.subtitle}
                        maxLength={BRIEF_CHAR_LIMITS.subtitle}
                        onChange={(event) =>
                          setBriefFields({
                            ...briefFields,
                            subtitle: event.target.value,
                          })
                        }
                      />
                    </label>
                    <fieldset className="brief-points-field">
                      <legend>{t("keyPoints")}</legend>
                      <PipelinePointInput
                        value={briefFields.points[0] ?? ""}
                        onChange={(value) =>
                          setBriefFields({
                            ...briefFields,
                            points: [
                              value,
                              briefFields.points[1] ?? "",
                              briefFields.points[2] ?? "",
                            ],
                          })
                        }
                      />
                      <PipelinePointInput
                        value={briefFields.points[1] ?? ""}
                        onChange={(value) =>
                          setBriefFields({
                            ...briefFields,
                            points: [
                              briefFields.points[0] ?? "",
                              value,
                              briefFields.points[2] ?? "",
                            ],
                          })
                        }
                      />
                      <PipelinePointInput
                        value={briefFields.points[2] ?? ""}
                        onChange={(value) =>
                          setBriefFields({
                            ...briefFields,
                            points: [
                              briefFields.points[0] ?? "",
                              briefFields.points[1] ?? "",
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
                        value={briefFields.cta}
                        maxLength={BRIEF_CHAR_LIMITS.cta}
                        onChange={(event) =>
                          setBriefFields({
                            ...briefFields,
                            cta: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="brief-edit-button"
                      onClick={() => setEditingBrief(false)}
                    >
                      {t("doneEditing")}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="generate-button"
                  onClick={handleGenerate}
                >
                  <Sparkles size={18} /> {t("generate")}
                </button>
                {step1Data?.ogImage && (
                  <p className="pipeline-meta">{t("pageImageReference")}</p>
                )}
              </>
            )}
          </div>
        );
      default:
        return <div />;
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      aria-labelledby="url-pipeline-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <div className="modal-card url-pipeline-dialog">
        <button
          type="button"
          className="modal-close"
          aria-label={t("closeUrlPipeline")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <p className="eyebrow">{t("urlToPoster")}</p>
        <h3 id="url-pipeline-title">{t("createFromLink")}</h3>
        <div className="url-pipeline">
          <ol className="url-pipeline-steps">
            {USER_STEPS.map((step) => {
              const state = steps[step.id];
              const selectable =
                state.status === "done" || state.status === "interactive";
              const statusClass =
                state.status === "done"
                  ? "is-done"
                  : state.status === "interactive"
                    ? "is-interactive"
                    : state.status === "error"
                      ? "is-error"
                      : "";
              const className = [
                statusClass,
                activeStep === step.id ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={step.id} className={className ?? ""}>
                  <button
                    type="button"
                    disabled={!selectable}
                    onClick={() => setActiveStep(step.id)}
                  >
                    <span className="url-step-icon">
                      <StepIcon status={state.status} />
                    </span>
                    <span>
                      {step.id === 1
                        ? t("readPage")
                        : step.id === 2
                          ? t("understandContent")
                          : t("posterCopy")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="url-pipeline-content">
            {streamError && (
              <div className="pipeline-error">
                <CircleAlert size={16} aria-hidden="true" />
                <span>{streamError}</span>
                <button
                  type="button"
                  className="brief-edit-button"
                  onClick={startPipeline}
                >
                  {t("retry")}
                </button>
              </div>
            )}
            {renderActiveStep()}
          </div>
        </div>
      </div>
    </dialog>
  );
}
