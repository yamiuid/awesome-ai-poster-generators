import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("./apimart", () => ({ submitChatCompletion: vi.fn() }));

import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { analyzeUrlStream } from "./analyze";
import { submitChatCompletion } from "./apimart";

async function collectEvents(rawUrl: string): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const line of analyzeUrlStream(rawUrl)) {
    events.push(JSON.parse(line));
  }
  return events;
}

function stepOf(event: unknown): number {
  return (event as { step: number }).step;
}

function statusOf(event: unknown): string {
  return (event as { status: string }).status;
}

const PUBLIC_ADDRESS = [
  { address: "93.184.216.34", family: 4 },
] as unknown as LookupAddress;

const SAMPLE_HTML =
  "<html><head><title>Page Title</title>" +
  "<meta property='og:description' content='A page about posters'/>" +
  "<meta property='og:image' content='/hero.png'/></head>" +
  "<body><h1>Heading One</h1><p>Some body text here.</p></body></html>";

describe("analyzeUrlStream", () => {
  const fetchMock = vi.fn();

  beforeAll(() => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://example.supabase.co";
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "anon";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service";
    process.env["APIMART_API_KEY"] = "key";
    process.env["WAFFO_MERCHANT_ID"] = "merchant";
    process.env["WAFFO_PRIVATE_KEY"] = "private";
    process.env["WAFFO_MONTHLY_PRODUCT_ID"] = "PROD_monthly";
    process.env["WAFFO_YEARLY_PRODUCT_ID"] = "PROD_yearly";
    process.env["CRON_SECRET"] = "x".repeat(40);
    process.env["RATE_LIMIT_PEPPER"] = "x".repeat(40);
  });

  beforeEach(() => {
    vi.mocked(lookup).mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(submitChatCompletion).mockReset();
    vi.mocked(lookup).mockResolvedValue(PUBLIC_ADDRESS);
    fetchMock.mockResolvedValue(
      new Response(SAMPLE_HTML, {
        headers: { "content-type": "text/html" },
      }),
    );
    vi.mocked(submitChatCompletion).mockImplementation(
      async (input: {
        messages: readonly { role: string; content: string }[];
      }) => {
        const system = input.messages.find((m) => m.role === "system")?.content;
        if (system?.includes("compact content understanding")) {
          return JSON.stringify({
            pageType: "article",
            topic: "Posters",
            audience: "Creators",
            primaryMessage: "Posters matter.",
            keyPoints: ["One", "Two", "Three"],
          });
        }
        return JSON.stringify({
          headline: "Posters Matter",
          subtitle: "A short guide",
          points: ["One", "Two", "Three"],
          cta: "Read more",
        });
      },
    );
  });

  it("emits every step in order with the expected data", async () => {
    const events = await collectEvents("https://example.com/post");

    expect(
      events.map((event) => `${stepOf(event)}:${statusOf(event)}`),
    ).toEqual([
      "1:running",
      "1:done",
      "2:running",
      "2:done",
      "3:running",
      "3:done",
      "4:running",
      "4:done",
      "5:running",
      "5:done",
      "6:running",
      "6:done",
      "0:complete",
    ]);

    const first = events[1] as { data: { url: string; domain: string } };
    expect(first.data.domain).toBe("example.com");

    const step3 = events[5] as {
      data: { title: string; ogImage?: string; headings: string[] };
    };
    expect(step3.data.title).toBe("Page Title");
    expect(step3.data.ogImage).toBe("https://example.com/hero.png");
    expect(step3.data.headings).toContain("Heading One");

    const step4 = events[7] as { data: { excerpt: string } };
    expect(step4.data.excerpt).toContain("Some body text here.");

    const step5 = events[9] as { data: { topic: string; pageType: string } };
    expect(step5.data.topic).toBe("Posters");
    expect(step5.data.pageType).toBe("article");

    const step6 = events[11] as { data: { headline: string; cta: string } };
    expect(step6.data.headline).toBe("Posters Matter");
    expect(step6.data.cta).toBe("Read more");

    const complete = events[12] as {
      data: { brief: { subtitle: string } };
    };
    expect(complete.data.brief.subtitle).toBe("A short guide");
  });

  it("fails at step 1 for an unsupported protocol", async () => {
    const events = await collectEvents("ftp://example.com/file");
    expect(events.map(stepOf)).toEqual([1, 1]);
    expect(statusOf(events[0])).toBe("running");
    expect(statusOf(events[1])).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails at step 2 when the page cannot be fetched", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const events = await collectEvents("https://example.com");
    expect(events.map(stepOf)).toEqual([1, 1, 2, 2]);
    expect(events[3]).toMatchObject({ step: 2, status: "error" });
  });

  it("fails at step 5 when understanding is not valid JSON", async () => {
    vi.mocked(submitChatCompletion).mockResolvedValue("not json at all");
    const events = await collectEvents("https://example.com");
    expect(events.map(stepOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(events[9]).toMatchObject({ step: 5, status: "error" });
  });
});
