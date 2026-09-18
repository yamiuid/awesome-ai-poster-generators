"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  isUiLocale,
  localizedPath,
  UI_LOCALES,
  type UiLocale,
} from "@/lib/i18n/locale";

const LOCALE_LABELS: Readonly<Record<UiLocale, string>> = {
  en: "English",
  "zh-TW": "繁體中文",
  ja: "日本語",
  es: "Español",
  ar: "العربية",
};

/**
 * 语言选择器。
 *
 * 同一个组件会同时挂在导航条（桌面端）和移动端抽屉的账户操作区里，
 * 两处都常驻 DOM、靠 CSS 决定哪一处可见，所以用 `idPrefix` 让各自的
 * listbox / option 元素 id 保持唯一。
 */
export function LocaleSwitcher({
  idPrefix = "locale-switcher",
}: Readonly<{ idPrefix?: string }>) {
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const pathname = usePathname();
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, UI_LOCALES.indexOf(locale));
  const listboxId = `${idPrefix}-listbox`;
  const optionId = (index: number): string => `${idPrefix}-option-${index}`;

  function openMenu(): void {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function selectAt(index: number): void {
    const nextLocale = UI_LOCALES[index];
    if (!nextLocale) {
      return;
    }
    localStorage.setItem("site-locale", nextLocale);
    window.location.assign(localizedPath(pathname, nextLocale));
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        !containerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex);
    }
  }, [open, selectedIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) {
          setActiveIndex((index) => Math.min(index + 1, UI_LOCALES.length - 1));
        } else {
          openMenu();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) {
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else {
          openMenu();
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) {
          selectAt(activeIndex);
        } else {
          openMenu();
        }
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(UI_LOCALES.length - 1);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="locale-switcher" ref={containerRef}>
      <span className="sr-only">{t("languageMenu")}</span>
      <button
        type="button"
        className="option-control"
        role="combobox"
        aria-label={t("languageMenu")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open ? optionId(activeIndex) : undefined
        }
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="option-control-label">
          {/* 移动端抽屉里显示「语言」标题，桌面端隐藏（只有当前语言值） */}
          <span className="locale-switcher-label">{t("language")}</span>
          <span className="option-control-text">{LOCALE_LABELS[locale]}</span>
        </span>
        <ChevronDown size={14} className="option-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listboxId}
          className="option-menu locale-switcher-menu"
          role="listbox"
          aria-label={t("languageMenu")}
        >
          {UI_LOCALES.map((option, index) => (
            <button
              key={option}
              type="button"
              id={optionId(index)}
              role="option"
              aria-selected={option === locale}
              className={`option-item ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => selectAt(index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="option-item-label">{LOCALE_LABELS[option]}</span>
              {option === locale && (
                <Check size={13} className="option-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LocaleSwitcherLinks() {
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const pathname = usePathname();
  const t = useTranslations("header");
  return (
    <nav className="locale-switcher-links" aria-label={t("languageMenu")}>
      {UI_LOCALES.map((option) => (
        <a
          key={option}
          href={localizedPath(pathname, option)}
          aria-current={option === locale ? "page" : undefined}
        >
          {LOCALE_LABELS[option]}
        </a>
      ))}
    </nav>
  );
}
