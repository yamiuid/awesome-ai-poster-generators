"use client";

import ky from "ky";
import { ArrowDownToLine, Trash2, X } from "lucide-react";
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
  // 大图 onLoad 前先显示加载文案（与首页历史预览一致）
  const [lightboxLoaded, setLightboxLoaded] = useState(false);
  // 已删除的卡片直接从列表里摘掉，不必等整页刷新
  const [deletedIds, setDeletedIds] = useState<readonly string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);

  async function removeGeneration(id: string): Promise<void> {
    setDeletingId(id);
    setDeleteErrorId(null);
    try {
      await ky.delete(`/api/generations/${id}`, { timeout: 30_000 });
      setDeletedIds((previous) => [...previous, id]);
      setConfirmingId(null);
    } catch {
      setDeleteErrorId(id);
    } finally {
      setDeletingId(null);
    }
  }

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

  // 手动删掉的卡片立刻从列表消失，不必等整页刷新
  const visibleItems = items.filter((item) => !deletedIds.includes(item.id));

  return (
    <section className="history-grid" aria-label={t("generationHistory")}>
      {visibleItems.map((item) => (
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
                  onClick={() => {
                    setLightboxLoaded(false);
                    setLightbox(image.url);
                  }}
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
                  <span className="history-figure-actions">
                    <a
                      className="download-link"
                      href={image.url}
                      download={`text-to-poster-${item.id.slice(0, 8)}.png`}
                    >
                      <ArrowDownToLine size={14} /> {t("download")}
                    </a>
                    {/* 删除是针对整次生成，多图卡片只在第一张旁边给入口 */}
                    {image.id === item.images[0]?.id && (
                      <button
                        type="button"
                        className="history-delete-link"
                        aria-label={t("deletePoster")}
                        onClick={() => {
                          setDeleteErrorId(null);
                          setConfirmingId(item.id);
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" />{" "}
                        {t("deletePoster")}
                      </button>
                    )}
                  </span>
                  {image.watermarked && (
                    <span className="watermark-note">{t("freePreview")}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          {/* 没有图片的卡片（失败/超时）没有下载行，删除入口单独放一行 */}
          {item.images.length === 0 && confirmingId !== item.id && (
            <div className="history-card-actions">
              <button
                type="button"
                className="history-delete-link"
                aria-label={t("deletePoster")}
                onClick={() => {
                  setDeleteErrorId(null);
                  setConfirmingId(item.id);
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> {t("deletePoster")}
              </button>
            </div>
          )}
          {confirmingId === item.id && (
            <div className="history-delete-confirm-row">
              <span>{t("deleteConfirm")}</span>
              <button
                type="button"
                className="history-delete-confirm"
                disabled={deletingId === item.id}
                onClick={() => void removeGeneration(item.id)}
              >
                {deletingId === item.id ? t("deleting") : t("deletePoster")}
              </button>
              <button
                type="button"
                className="history-delete-cancel"
                onClick={() => setConfirmingId(null)}
              >
                {t("deleteCancel")}
              </button>
            </div>
          )}
          <p className="history-prompt">{item.prompt}</p>
          {deleteErrorId === item.id && (
            <p className="history-delete-error" role="alert">
              {t("deleteFailed")}
            </p>
          )}
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
          {lightboxLoaded ? null : (
            <span className="lightbox-loading" role="status">
              {t("loadingPoster")}
            </span>
          )}
          <Image
            src={lightbox}
            alt={t("posterPreview")}
            width={1024}
            height={1280}
            className={
              lightboxLoaded ? "lightbox-image is-loaded" : "lightbox-image"
            }
            onLoad={() => setLightboxLoaded(true)}
          />
        </div>
      )}
    </section>
  );
}
