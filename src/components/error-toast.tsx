"use client";

import { CircleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type JSX, useEffect, useSyncExternalStore } from "react";

type ErrorToastState = Readonly<{ id: number; message: string }>;

/** 自动消失时间：够读完一句话，又不至于长期挡住内容 */
const TOAST_DURATION_MS = 5_000;

// 模块级单例：任意客户端组件 import { notifyError } 即可弹出全局提示，
// 不需要把状态层层传下去，也不会因为所在页面卸载而丢掉提示。
let current: ErrorToastState | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function notifyError(message: string): void {
  current = { id: nextId++, message };
  emit();
}

export function dismissErrorToast(): void {
  if (current === null) {
    return;
  }
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ErrorToastState | null {
  return current;
}

/** 服务端没有提示可渲染，保证 hydration 前后一致 */
function getServerSnapshot(): ErrorToastState | null {
  return null;
}

export function ErrorToast(): JSX.Element | null {
  const t = useTranslations("common");
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => {
      // 期间若又弹了新提示，就不要把新的那条一起关掉
      if (current?.id === toast.id) {
        dismissErrorToast();
      }
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="error-toast" role="alert" aria-live="assertive">
      <CircleAlert size={16} className="error-toast-icon" aria-hidden="true" />
      <p>{toast.message}</p>
      <button
        type="button"
        className="error-toast-close"
        aria-label={t("close")}
        onClick={dismissErrorToast}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
