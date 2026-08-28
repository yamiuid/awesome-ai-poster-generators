"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { LoginForm } from "@/components/login-form";

type HeaderLoginDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export function HeaderLoginDialog({ open, onClose }: HeaderLoginDialogProps) {
  const t = useTranslations("header");
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  return (
    <dialog
      id="header-login-dialog"
      ref={dialogRef}
      className="modal-backdrop"
      aria-labelledby="header-login-title"
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
      <div className="modal-card header-login-card">
        <button
          type="button"
          className="modal-close"
          aria-label={t("closeMenu")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <p className="eyebrow">{t("loginTitle")}</p>
        <h3 id="header-login-title">{t("loginHeading")}</h3>
        <p className="modal-note">{t("loginBody")}</p>
        <LoginForm next="/#studio" onSuccess={onClose} />
      </div>
    </dialog>
  );
}
