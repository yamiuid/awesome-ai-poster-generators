import type { Metadata } from "next";
import { localizedPath, type UiLocale } from "@/lib/i18n/locale";

export const siteUrl = "https://texttoposter.com";
const siteName = "Text to Poster";

export const ogImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Text to Poster AI poster studio",
};

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
  locale?: UiLocale;
  localizedAlternates?: boolean;
};

export function pageMeta({
  title,
  description,
  path,
  locale = "en",
  localizedAlternates = true,
}: PageMetaInput): Metadata {
  const canonical = localizedPath(path, locale);
  const url = `${siteUrl}${canonical}`;
  const languages = localizedAlternates
    ? {
        en: localizedPath(path, "en"),
        "zh-TW": localizedPath(path, "zh-TW"),
        ja: localizedPath(path, "ja"),
        "es-419": localizedPath(path, "es"),
        ar: localizedPath(path, "ar"),
        "x-default": localizedPath(path, "en"),
      }
    : undefined;
  return {
    title,
    description,
    alternates: { canonical, ...(languages ? { languages } : {}) },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
