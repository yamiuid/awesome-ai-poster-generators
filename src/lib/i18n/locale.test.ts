import { describe, expect, it } from "vitest";
import {
  localeFromAcceptLanguage,
  localeFromPath,
  localizedPath,
  waffoLocaleFor,
} from "./locale";

describe("locale routing", () => {
  it("extracts supported locales from paths", () => {
    expect(localeFromPath("/ja/pricing")).toBe("ja");
    expect(localeFromPath("/pricing")).toBe("en");
    expect(localeFromPath("/zh-TW")).toBe("zh-TW");
  });

  it("maps browser language tags to supported locales", () => {
    expect(localeFromAcceptLanguage("zh-HK,zh;q=0.9")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("es-AR,es;q=0.9")).toBe("es");
    expect(localeFromAcceptLanguage("de-DE,en;q=0.8")).toBe("en");
  });

  it("preserves query strings and hashes when localizing a path", () => {
    expect(localizedPath("/pricing?plan=creator#plans", "ar")).toBe(
      "/ar/pricing?plan=creator#plans",
    );
    expect(localizedPath("/privacy", "ja")).toBe("/privacy");
  });

  it("maps unsupported Arabic checkout to the English cashier", () => {
    expect(waffoLocaleFor("zh-TW")).toBe("zh-Hant-TW");
    expect(waffoLocaleFor("ja")).toBe("ja-JP");
    expect(waffoLocaleFor("es")).toBe("es-MX");
    expect(waffoLocaleFor("ar")).toBe("en");
  });
});
