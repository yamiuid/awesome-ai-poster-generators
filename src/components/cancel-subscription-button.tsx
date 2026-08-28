"use client";

import ky from "ky";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function CancelSubscriptionButton() {
  const t = useTranslations("checkout");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Esc 关闭弹窗
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function confirmCancel(): Promise<void> {
    setLoading(true);
    try {
      await ky.post("/api/subscription/cancel");
      setOpen(false);
      setMessage(t("cancellationRequested"));
      // 刷新账单页，订阅状态从 Active 变为 Cancels at period end
      router.refresh();
    } catch {
      setOpen(false);
      setMessage(t("cancellationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cancel-action">
      <button
        className="text-button danger"
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {t("cancelSubscription")}
      </button>
      {message && <p className="form-message">{message}</p>}
      {open && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("confirmCancellation")}
          onClick={(event) => {
            // 仅点击遮罩本身（非卡片）时关闭
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <div className="modal-card">
            <button
              type="button"
              className="modal-close"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <p className="eyebrow">{t("subscription")}</p>
            <h3>{t("cancelHeading")}</h3>
            <p className="modal-note">{t("cancelBody")}</p>
            <div className="modal-actions">
              <button
                className="outline-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                {t("keepSubscription")}
              </button>
              <button
                className="solid-button danger-button"
                type="button"
                onClick={() => void confirmCancel()}
                disabled={loading}
              >
                {loading ? t("canceling") : t("confirmCancellation")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
