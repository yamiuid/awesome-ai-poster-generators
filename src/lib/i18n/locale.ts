export const UI_LOCALES = ["en", "zh-TW", "ja", "es", "ar"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = "en";
export type WaffoCheckoutLocale = "en" | "zh-Hant-TW" | "ja-JP" | "es-MX";

const LOCALE_SEGMENTS: ReadonlySet<string> = new Set(UI_LOCALES);
const UNLOCALIZED_PATHS: ReadonlySet<string> = new Set([
  "/privacy",
  "/terms",
  "/refunds",
  "/ai-policy",
]);

export function isUiLocale(value: string): value is UiLocale {
  return LOCALE_SEGMENTS.has(value);
}

export function toUiLocale(value: string | null | undefined): UiLocale {
  return value && isUiLocale(value) ? value : DEFAULT_LOCALE;
}

function normalizePathname(pathname: string): string {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function localeFromPath(pathname: string): UiLocale {
  const segment = normalizePathname(pathname).split("/")[1] ?? "";
  return isUiLocale(segment) ? segment : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
  const normalized = normalizePathname(pathname);
  const segment = normalized.split("/")[1] ?? "";
  if (!LOCALE_SEGMENTS.has(segment)) {
    return normalized;
  }
  const rest = normalized.slice(segment.length + 1);
  return rest.length > 0 ? rest : "/";
}

function localeForLanguageTag(tag: string): UiLocale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }
  if (normalized.startsWith("zh")) {
    return "zh-TW";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  if (normalized.startsWith("es")) {
    return "es";
  }
  if (normalized.startsWith("ar")) {
    return "ar";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return null;
}

export function localeFromAcceptLanguage(
  header: string | null | undefined,
): UiLocale | null {
  if (!header) {
    return null;
  }
  const candidates = header
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const weight = quality ? Number(quality.trim().slice(2)) : 1;
      return { tag: tag ?? "", weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((candidate) => candidate.weight > 0)
    .sort((left, right) => right.weight - left.weight);

  for (const candidate of candidates) {
    const locale = localeForLanguageTag(candidate.tag);
    if (locale) {
      return locale;
    }
  }
  return null;
}

export function isUserPagePath(pathname: string): boolean {
  const normalized = stripLocalePrefix(pathname);
  if (UNLOCALIZED_PATHS.has(normalized)) {
    return false;
  }
  return !["/admin", "/api", "/auth", "/_next", "/favicon.ico"].some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function localizedPath(pathname: string, locale: UiLocale): string {
  const match = /^([^?#]*)([?#].*)?$/u.exec(pathname);
  const path = stripLocalePrefix(match?.[1] ?? "/");
  const suffix = match?.[2] ?? "";
  if (
    locale === DEFAULT_LOCALE ||
    UNLOCALIZED_PATHS.has(path) ||
    !isUserPagePath(path)
  ) {
    return `${path}${suffix}`;
  }
  return `/${locale}${path === "/" ? "" : path}${suffix}`;
}

export function waffoLocaleFor(locale: UiLocale): WaffoCheckoutLocale {
  switch (locale) {
    case "zh-TW":
      return "zh-Hant-TW";
    case "ja":
      return "ja-JP";
    case "es":
      return "es-MX";
    case "en":
    case "ar":
      return "en";
    default:
      return assertNever(locale);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected UI locale: ${String(value)}`);
}
