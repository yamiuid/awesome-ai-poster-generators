"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_COPY } from "@/lib/i18n/analytics-consent-copy";
import { isUiLocale, type UiLocale } from "@/lib/i18n/locale";

const CONSENT_STORAGE_KEY = "ttp-analytics-consent";
const GOOGLE_ANALYTICS_ID = "G-P36HDHF4KN";
const CLARITY_PROJECT_ID = "y0nc1qmg8a";

type ConsentState = "loading" | "unset" | "granted" | "denied";
type ClarityFunction = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: ClarityFunction;
    dataLayer?: unknown[][];
  }
}

function loadOptionalAnalytics(): void {
  if (!document.getElementById("google-analytics-script")) {
    window.dataLayer ??= [];
    const gtag = (...args: unknown[]): void => {
      window.dataLayer?.push(args);
    };
    gtag("js", new Date());
    gtag("config", GOOGLE_ANALYTICS_ID);
    const googleScript = document.createElement("script");
    googleScript.id = "google-analytics-script";
    googleScript.async = true;
    googleScript.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
    document.head.appendChild(googleScript);
  }

  if (!document.getElementById("microsoft-clarity-script")) {
    const queue: unknown[][] = [];
    const clarity: ClarityFunction = (...args: unknown[]): void => {
      queue.push(args);
    };
    clarity.q = queue;
    window.clarity = clarity;
    const clarityScript = document.createElement("script");
    clarityScript.id = "microsoft-clarity-script";
    clarityScript.async = true;
    clarityScript.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    document.head.appendChild(clarityScript);
  }
}

function unloadOptionalAnalytics(): void {
  document.getElementById("google-analytics-script")?.remove();
  document.getElementById("microsoft-clarity-script")?.remove();
  delete window.dataLayer;
  delete window.clarity;
}

export function AnalyticsConsent() {
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const copy = ANALYTICS_CONSENT_COPY[locale];
  const [consent, setConsent] = useState<ConsentState>("loading");

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "granted") {
      setConsent("granted");
      loadOptionalAnalytics();
      return;
    }
    setConsent(stored === "denied" ? "denied" : "unset");
  }, []);

  if (consent === "loading") {
    return null;
  }

  if (consent !== "unset") {
    return (
      <button
        type="button"
        className="analytics-consent-manage"
        onClick={() => {
          window.localStorage.removeItem(CONSENT_STORAGE_KEY);
          unloadOptionalAnalytics();
          setConsent("unset");
        }}
      >
        {copy.manage}
      </button>
    );
  }

  const choose = (next: "granted" | "denied"): void => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, next);
    setConsent(next);
    if (next === "granted") {
      loadOptionalAnalytics();
    }
  };

  return (
    <aside className="analytics-consent" role="dialog" aria-live="polite">
      <div>
        <p className="analytics-consent-title">{copy.title}</p>
        <p className="analytics-consent-body">{copy.body}</p>
      </div>
      <div className="analytics-consent-actions">
        <button
          type="button"
          className="analytics-consent-accept"
          onClick={() => choose("granted")}
        >
          {copy.accept}
        </button>
        <button
          type="button"
          className="analytics-consent-decline"
          onClick={() => choose("denied")}
        >
          {copy.decline}
        </button>
        <a href="/privacy">{copy.privacy}</a>
      </div>
    </aside>
  );
}
