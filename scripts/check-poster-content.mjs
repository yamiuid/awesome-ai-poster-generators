import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run against pnpm start: node scripts/check-poster-content.mjs [base URL]
const base = process.argv[2] ?? "http://localhost:3010";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  // Given either content page, when viewed at each breakpoint, then it fits the viewport.
  for (const route of ["how-to-make-a-poster", "poster-design-ideas"]) {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/${route}`);
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
  }

  // Given an idea, when its copy action is used, then the clipboard contains its exact prompt.
  const figures = page.locator(".poster-ideas-grid figure");
  const galleryPrompts = new Map();
  assert.equal(await figures.count(), 12);
  for (const figure of await figures.all()) {
    await figure.locator("img").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (id) => {
        const image = document.getElementById(id).querySelector("img");
        return image.complete && image.naturalWidth > 0;
      },
      await figure.getAttribute("id"),
      { timeout: 15000 },
    );
    const prompt = await figure.locator(".idea-prompt").innerText();
    const imageSrc = await figure.locator("img").getAttribute("src");
    assert.equal(
      await figure
        .locator("img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    galleryPrompts.set(
      new URL(imageSrc, base).searchParams.get("url") ?? imageSrc,
      prompt,
    );
    assert.equal(await figure.locator("details").count(), 0);
    assert.equal(
      await figure
        .locator(".idea-prompt")
        .evaluate((element) => getComputedStyle(element).webkitLineClamp),
      "2",
    );
    await figure.getByRole("button").click();
    await page.waitForFunction(
      (expected) =>
        navigator.clipboard.readText().then((text) => text === expected),
      prompt,
    );
    assert.equal(await figure.getByRole("status").innerText(), "Copied");
  }

  await page.goto(base);
  const dots = page
    .locator(".studio-carousel-dots")
    .filter({ visible: true })
    .first();
  await dots.waitFor();
  let matchedExamples = 0;
  for (let index = 0; index < (await dots.locator("button").count()); index++) {
    await dots.locator("button").nth(index).click();
    const example = page
      .locator(".studio-example-image-button")
      .filter({ visible: true })
      .first();
    const imageSrc = await example.locator("img").getAttribute("src");
    const expected = galleryPrompts.get(
      new URL(imageSrc, base).searchParams.get("url") ?? imageSrc,
    );
    if (expected === undefined) continue;
    await example.click();
    assert.equal(await page.locator("textarea").first().inputValue(), expected);
    matchedExamples++;
  }
  assert.equal(matchedExamples, 3);

  // Given the tutorial, when prompts and sample download are used, then their contents are available.
  await page.goto(`${base}/how-to-make-a-poster`);
  for (const section of await page
    .locator("section:has(.copy-prompt-action button)")
    .all()) {
    const prompt = await section.locator("pre code").innerText();
    await section.getByRole("button").click();
    await page.waitForFunction(
      (expected) =>
        navigator.clipboard.readText().then((text) => text === expected),
      prompt,
    );
  }
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download example artwork" }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), "sunroom-sessions-example.webp");
  assert.equal(await download.failure(), null);
  for (const image of ["poster-brief", "poster-settings"]) {
    assert.equal(
      (await page.request.get(`${base}/tutorial/${image}.webp`)).status(),
      200,
    );
  }

  // Given clipboard access fails, when copying, then a visible manual-copy fallback appears.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard blocked");
        },
      },
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "Copy live-music prompt", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Copy unavailable" })
    .waitFor();
  const localizedPage = await context.newPage();
  for (const [locale, title] of Object.entries({
    "zh-TW": "海報設計靈感",
    ja: "ポスターデザインのアイデア",
    es: "Ideas de diseño de pósteres",
    ar: "أفكار لتصميم الملصقات",
  })) {
    for (const width of [375, 1280]) {
      await localizedPage.setViewportSize({ width, height: 900 });
      await localizedPage.goto(`${base}/${locale}/poster-design-ideas`);
      assert.equal(await localizedPage.locator("h1").innerText(), title);
      assert.equal(
        await localizedPage.locator(".poster-ideas-grid figure").count(),
        12,
      );
      assert.equal(
        await localizedPage
          .locator('link[rel="canonical"]')
          .getAttribute("href"),
        `https://texttoposter.com/${locale}/poster-design-ideas`,
      );
      assert.equal(
        await localizedPage.locator('link[rel="alternate"][hreflang]').count(),
        6,
      );
      assert.equal(
        await localizedPage.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.equal(
        await localizedPage.locator("html").getAttribute("dir"),
        locale === "ar" ? "rtl" : "ltr",
      );
      const first = localizedPage.locator(".poster-ideas-grid figure").first();
      const prompt = await first.locator(".idea-prompt").innerText();
      await first.getByRole("button").click();
      await localizedPage.waitForFunction(
        (expected) =>
          navigator.clipboard.readText().then((text) => text === expected),
        prompt,
      );
      assert.ok(await first.getByRole("status").innerText());
      assert.notEqual(
        await first.getByRole("button").innerText(),
        "Copy prompt",
      );
    }
  }
  await localizedPage.getByRole("combobox").filter({ visible: true }).click();
  await localizedPage
    .getByRole("option", { name: "日本語", exact: true })
    .click();
  await localizedPage.waitForURL(`${base}/ja/poster-design-ideas`);
  assert.equal(
    await localizedPage.locator("h1").innerText(),
    "ポスターデザインのアイデア",
  );
  console.log(
    "Poster content checks passed: responsive pages, fourteen prompt copies, twelve loaded idea images, three matching studio examples, sample download, clipboard fallback and four localized pages at two breakpoints.",
  );
} finally {
  await browser.close();
}
