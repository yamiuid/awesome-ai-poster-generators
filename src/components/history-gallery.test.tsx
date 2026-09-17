import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { messagesForLocale } from "@/i18n/messages";
import { HistoryGallery, type HistoryItem } from "./history-gallery";

const item = (overrides: Partial<HistoryItem>): HistoryItem => ({
  id: "gen-1",
  prompt: "A poster",
  createdAt: "2026-08-30T00:00:00.000Z",
  status: "succeeded",
  images: [],
  ...overrides,
});

const render = (items: HistoryItem[]): string =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messagesForLocale("en")}>
      <HistoryGallery items={items} />
    </NextIntlClientProvider>,
  );

describe("HistoryGallery empty states", () => {
  it("says the images expired when a finished poster has no assets left", () => {
    const html = render([item({ status: "succeeded" })]);

    expect(html).toContain("passed their retention window");
  });

  it("keeps the in-progress copy for a poster that is still generating", () => {
    const html = render([item({ status: "processing" })]);

    expect(html).toContain("Images are on their way.");
  });

  it("keeps the failure copy for a run that produced nothing", () => {
    const html = render([item({ status: "failed" })]);

    expect(html).toContain("No images for this run.");
  });
});
