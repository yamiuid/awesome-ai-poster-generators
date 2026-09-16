"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import {
  isUiLocale,
  isUserPagePath,
  localeFromAcceptLanguage,
  localizedPath,
  type UiLocale,
} from "@/lib/i18n/locale";
import { LOCALE_BANNER_COPY } from "@/lib/i18n/locale-banner-copy";

export function LocaleSuggestion() {
  const rawLocale = useLocale();
  const pathname = usePathname();
  const currentLocale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const [suggestedLocale, setSuggestedLocale] = useState<UiLocale | null>(null);

  useEffect(() => {
    if (
      currentLocale !== "en" ||
      !isUserPagePath(pathname) ||
      sessionStorage.getItem("locale-suggestion-dismissed")
    ) {
      return;
    }
    const suggested = localeFromAcceptLanguage(navigator.language);
    if (suggested && suggested !== "en") {
      setSuggestedLocale(suggested);
    }
  }, [currentLocale, pathname]);

  if (!suggestedLocale) {
    return null;
  }

  const label =
    suggestedLocale === "zh-TW"
      ? "繁體中文"
      : suggestedLocale === "ja"
        ? "日本語"
        : suggestedLocale === "es"
          ? "Español"
          : "العربية";
  // 建议条整体用目标语言表达，包括两个按钮
  const copy = LOCALE_BANNER_COPY[suggestedLocale];
  const text = (template: string): string =>
    template.replaceAll("{language}", label);

  return (
    <aside className="locale-suggestion" role="status">
      <p>{text(copy.suggestion)}</p>
      <a
        className="locale-suggestion-switch"
        href={localizedPath("/", suggestedLocale)}
      >
        {text(copy.view)}
      </a>
      <button
        type="button"
        className="locale-suggestion-keep"
        onClick={() => {
          sessionStorage.setItem("locale-suggestion-dismissed", "1");
          setSuggestedLocale(null);
        }}
      >
        {copy.dismiss}
      </button>
    </aside>
  );
}
