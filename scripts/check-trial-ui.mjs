// Run against a local server: node scripts/check-trial-ui.mjs [http://127.0.0.1:3100]
// All generation requests are intercepted; this check never calls an image provider.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:3100";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true });
try {
  for (const paid of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 900 },
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "ttp-guest-resume",
        JSON.stringify({
          at: Date.now(),
          overrides: {
            prompt: "An editorial poster",
            resolution: "1k",
            quality: "low",
            imageCount: 1,
          },
        }),
      );
    });
    const page = await context.newPage();
    await page.route(`${origin}/api/account/status`, (route) =>
      route.fulfill({
        json: {
          signedIn: true,
          isPro: paid,
          hasPack: false,
          subscriptionState: paid ? "active" : "none",
          balance: { available: 20, bucket: "permanent", grants: [] },
        },
      }),
    );
    await page.route(`${origin}/api/generations**`, (route) =>
      route.fulfill({
        json:
          route.request().method() === "POST"
            ? {
                id: "ui-check",
                status: "submitted",
                progress: 0,
                aspectRatio: "2:3",
                creditsReserved: 6,
                nextPollAt: new Date(Date.now() + 600_000).toISOString(),
              }
            : { active: [], recent: [] },
      }),
    );
    const submission = page.waitForRequest(
      (request) =>
        request.url() === `${origin}/api/generations` &&
        request.method() === "POST",
    );
    await page.goto(`${origin}/zh-TW`);
    const body = (await submission).postDataJSON();
    assert.equal(body.resolution, "1k");
    assert.equal(body.quality, "low");
    assert.equal(body.imageCount, 1);
    console.log(
      `${paid ? "Paid" : "Free"} signup resume: ${body.resolution}/${body.quality}/1 passed`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
