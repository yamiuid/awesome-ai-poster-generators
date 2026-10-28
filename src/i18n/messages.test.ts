import { describe, expect, it } from "vitest";
import { UI_LOCALES } from "@/lib/i18n/locale";
import { messagesForLocale } from "./messages";

type MessageNode = string | { readonly [key: string]: MessageNode };

function leafPaths(tree: MessageNode, prefix = ""): string[] {
  if (typeof tree === "string") {
    return [prefix];
  }
  return Object.entries(tree).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

const keysByLocale = new Map(
  UI_LOCALES.map((locale) => [
    locale,
    new Set(leafPaths(messagesForLocale(locale) as MessageNode)),
  ]),
);

const allKeys = new Set(
  [...keysByLocale.values()].flatMap((keys) => [...keys]),
);

function missingKeys(locale: (typeof UI_LOCALES)[number]): string[] {
  const keys = keysByLocale.get(locale) ?? new Set<string>();
  return [...allKeys].filter((key) => !keys.has(key)).sort();
}

describe("locale message parity", () => {
  for (const locale of UI_LOCALES) {
    it(`${locale} defines every key used by any locale`, () => {
      expect(missingKeys(locale)).toEqual([]);
    });
  }
});

/**
 * 账户页的「方案已结束」文案：parity 测试只比较 key 集合，
 * 而 locale 会回退到英文基线，所以 key 是否真能解析必须单独断言。
 */
describe("account plan-ended copy", () => {
  const keys = [
    "planEnded",
    "expiredPlanCredits",
    "renewPlan",
    "upgradePlan",
    "buyCredits",
    "deletePoster",
    "deleteConfirm",
    "deleteCancel",
    "deleting",
    "deleteFailed",
    "imagesExpired",
  ] as const;

  const accountMessage = (
    locale: (typeof UI_LOCALES)[number],
    key: (typeof keys)[number],
  ): string => {
    const tree = messagesForLocale(locale);
    const account =
      typeof tree === "object" && tree !== null
        ? (tree["account"] as MessageNode | undefined)
        : undefined;
    const value =
      typeof account === "object" && account !== null
        ? account[key]
        : undefined;
    return typeof value === "string" ? value : "";
  };

  for (const locale of UI_LOCALES) {
    it(`${locale} resolves the plan-ended strings`, () => {
      for (const key of keys) {
        expect(accountMessage(locale, key).length).toBeGreaterThan(0);
      }
      expect(accountMessage(locale, "planEnded")).toContain("{tier}");
      expect(accountMessage(locale, "expiredPlanCredits")).toContain(
        "{credits}",
      );
    });
  }
});

describe("trial pricing copy", () => {
  for (const locale of UI_LOCALES) {
    it(`${locale} resolves the 1K Low trial estimate and 20-credit grant`, () => {
      // Given: the final merged locale used by the pricing page.
      const pricing = messagesForLocale(locale)["pricing"];
      if (typeof pricing !== "object" || pricing === null)
        throw new Error("Missing pricing messages");
      // When: the page reads the free trial card strings.
      const estimate = pricing["freeCreditsNote"];
      const grant = pricing["welcomeCreditsLine"];
      const freeOutput = pricing["freeFeature2"];
      // Then: no missing-key fallback or stale grant is shown.
      expect(estimate).toContain("{count}");
      expect(estimate).toContain("1K");
      expect(freeOutput).toContain("1K");
      expect(freeOutput).not.toContain("2K");
      expect(grant).toContain("20");
    });
  }
});
