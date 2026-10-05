import { afterEach, expect, it, vi } from "vitest";
import { loadOptionalAnalytics } from "./analytics-consent";

afterEach(() => vi.unstubAllGlobals());

it("queues GA commands in the format gtag.js recognizes when analytics loads", () => {
  // Given a browser with no analytics scripts yet.
  const browser: { dataLayer?: unknown[] } = {};
  const scripts = new Map<string, { id: string; src: string }>();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    getElementById: (id: string) => scripts.get(id),
    createElement: () => ({ id: "", src: "", async: false }),
    head: {
      appendChild: (script: { id: string; src: string }) => {
        scripts.set(script.id, script);
      },
    },
  });

  // When optional analytics is enabled.
  loadOptionalAnalytics();

  // Then GA receives Arguments commands, rather than ignored array entries.
  const commands = browser.dataLayer ?? [];
  expect(commands).toHaveLength(2);
  expect(
    commands.map((command) => Object.prototype.toString.call(command)),
  ).toEqual(["[object Arguments]", "[object Arguments]"]);
  expect(commands[1]).toMatchObject({ 0: "config", 1: "G-P36HDHF4KN" });

  loadOptionalAnalytics();
  expect(scripts.size).toBe(2);
  expect(commands).toHaveLength(2);
});
