"use client";

import { useEffect } from "react";

const GOOGLE_ANALYTICS_ID = "G-P36HDHF4KN";
const CLARITY_PROJECT_ID = "y0nc1qmg8a";

type ClarityFunction = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: ClarityFunction;
    dataLayer?: unknown[];
  }
}

export function loadOptionalAnalytics(): void {
  if (!document.getElementById("google-analytics-script")) {
    window.dataLayer ??= [];
    function gtag(_command: string, _value: unknown): void {
      // biome-ignore lint/complexity/noArguments: gtag.js recognizes Arguments commands, not arrays.
      window.dataLayer?.push(arguments);
    }
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

export function AnalyticsConsent() {
  useEffect(() => {
    loadOptionalAnalytics();
  }, []);

  return null;
}
