"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  isUiLocale,
  isUserPagePath,
  localeFromAcceptLanguage,
  localizedPath,
  type UiLocale,
} from "@/lib/i18n/locale";

export function LocaleSuggestion() {
  const rawLocale = useLocale();
  const pathname = usePathname();
  const currentLocale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = useTranslations("banner");
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

  return (
    <aside className="locale-suggestion" role="status">
      <p>{t("suggestion", { language: label })}</p>
      <a href={localizedPath("/", suggestedLocale)}>
        {t("view", { language: label })}
      </a>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("locale-suggestion-dismissed", "1");
          setSuggestedLocale(null);
        }}
      >
        {t("dismiss")}
      </button>
    </aside>
  );
}
