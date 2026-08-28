"use client";

import ky from "ky";
import { ArrowDownToLine, X } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type HistoryImage = Readonly<{
  id: string;
  url: string;
  alt: string;
  watermarked: boolean;
}>;

export type HistoryItem = Readonly<{
  id: string;
  prompt: string;
  createdAt: string;
  status: string;
  images: readonly HistoryImage[];
  mode?: string | undefined;
  creditsReserved?: number | undefined;
  creditsConsumed?: number | undefined;
}>;

type Translator = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

function creditChipText(item: HistoryItem, t: Translator): string | null {
  const reserved = item.creditsReserved;
  if (!reserved || reserved <= 0 || item.mode !== "pro") {
    return null;
  }
  if (item.status === "submitted" || item.status === "processing") {
    return t("reserving", { credits: reserved });
  }
  if (item.status === "failed" || item.status === "timed_out") {
    return t("released", { credits: reserved });
  }
  const consumed = item.creditsConsumed ?? reserved;
  const saved = reserved - consumed;
  return saved > 0
    ? t("usedSaved", { used: consumed, saved })
    : t("used", { credits: consumed });
}

export function HistoryGallery({
  items,
}: Readonly<{ items: readonly HistoryItem[] }>) {
  const locale = useLocale();
  const t = useTranslations("account");
  const [lightbox, setLightbox] = useState<string | null>(null);

  // 对挂起任务触发后台推进（重活：查 APIMart + 下载/水印/上传）。
  // 接口幂等 + 120s 超时静默——服务端继续处理，页面 meta refresh 后可见结果。
  // 生产由 Vercel cron 兜底，这里只做用户活跃时的即时推进。
  useEffect(() => {
    for (const item of items) {
      if (item.status === "submitted" || item.status === "processing") {
        void ky
          .post(`/api/generations/${item.id}/advance`, { timeout: 120_000 })
          .catch(() => {});
      }
    }
  }, [items]);

  // lightbox：Esc 关闭 + 锁定滚动
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

  return (
    <section className="history-grid" aria-label={t("generationHistory")}>
      {items.map((item) => (
        <article className="history-card" key={item.id}>
          <div className="history-card-head">
            <span>
              {new Date(item.createdAt).toLocaleDateString(locale, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="history-card-meta">
              {creditChipText(item, t) && (
                <span className="history-credit-chip">
                  {creditChipText(item, t)}
                </span>
              )}
              {item.status === "submitted" || item.status === "processing"
                ? t("generating")
                : item.status === "succeeded"
                  ? t("ready")
                  : item.status === "partially_succeeded"
                    ? t("partlyReady")
                    : item.status === "failed"
                      ? t("failed")
                      : item.status === "timed_out"
                        ? t("timedOut")
                        : item.status}
            </span>
          </div>
          <div className="history-thumbs">
            {item.images.length === 0 && (
              <div className="history-no-images">
                {item.status === "failed" || item.status === "timed_out"
                  ? t("noImages")
                  : t("imagesOnWay")}
              </div>
            )}
            {item.images.map((image) => (
              <figure className="history-figure" key={image.id}>
                <button
                  type="button"
                  className="history-zoom"
                  onClick={() => setLightbox(image.url)}
                  aria-label={`View ${image.alt} full size`}
                >
                  <Image
                    src={image.url}
                    alt={image.alt}
                    width={1024}
                    height={1280}
                  />
                </button>
                <figcaption>
                  <a
                    className="download-link"
                    href={image.url}
                    download={`text-to-poster-${item.id.slice(0, 8)}.png`}
                  >
                    <ArrowDownToLine size={14} /> {t("download")}
                  </a>
                  {image.watermarked && (
                    <span className="watermark-note">{t("freePreview")}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="history-prompt">{item.prompt}</p>
        </article>
      ))}
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("fullSizePreview")}
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
        </div>
      )}
    </section>
  );
}
