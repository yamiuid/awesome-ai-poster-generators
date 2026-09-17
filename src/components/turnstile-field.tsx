"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = Readonly<{
  render: (
    element: HTMLElement,
    options: Readonly<Record<string, unknown>>,
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}>;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile needs a browser"));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      reject(new Error("Turnstile script loaded without an API"));
    });
    script.addEventListener("error", () => {
      reject(new Error("Turnstile script failed to load"));
    });
    document.head.appendChild(script);
  });
  // 加载失败时清掉缓存，下次挂载可以重试
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

type Props = Readonly<{
  siteKey: string;
  /** Cloudflare 侧用于区分入口的 action 名（1–32 位字母数字下划线连字符） */
  action: string;
  /** 每次提交后自增：Turnstile token 一次性，必须换一个新的 */
  resetSignal: number;
  onToken: (token: string) => void;
  onUnavailable: () => void;
}>;

export function TurnstileField({
  siteKey,
  action,
  resetSignal,
  onToken,
  onUnavailable,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // 回调放进 ref：挂载 effect 不需要因为父组件重渲染而重跑
  const onTokenRef = useRef(onToken);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onTokenRef.current = onToken;
    onUnavailableRef.current = onUnavailable;
  }, [onToken, onUnavailable]);

  useEffect(() => {
    let cancelled = false;
    void loadTurnstile()
      .then((turnstile) => {
        const container = containerRef.current;
        if (cancelled || !container || widgetIdRef.current) {
          return;
        }
        widgetIdRef.current = turnstile.render(container, {
          sitekey: siteKey,
          action,
          theme: "auto",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            onUnavailableRef.current();
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          onTokenRef.current("");
          onUnavailableRef.current();
        }
      });

    return () => {
      cancelled = true;
      const container = containerRef.current;
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      if (container && widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
        container.replaceChildren();
      }
    };
  }, [siteKey, action]);

  useEffect(() => {
    const widgetId = widgetIdRef.current;
    if (resetSignal === 0 || !widgetId || !window.turnstile) {
      return;
    }
    window.turnstile.reset(widgetId);
  }, [resetSignal]);

  return <div className="login-captcha-widget" ref={containerRef} />;
}
