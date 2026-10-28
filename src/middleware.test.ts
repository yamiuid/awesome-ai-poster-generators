import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("canonical URL redirects", () => {
  it.each([
    {
      requestUrl: "http://texttoposter.com/anime-poster-maker?ref=seo",
      location: "https://texttoposter.com/anime-poster-maker?ref=seo",
    },
    {
      requestUrl: "http://www.texttoposter.com/sitemap.xml",
      location: "https://texttoposter.com/sitemap.xml",
    },
    {
      requestUrl: "https://www.texttoposter.com/robots.txt",
      location: "https://texttoposter.com/robots.txt",
    },
  ])(
    "redirects $requestUrl to the canonical origin",
    async ({ requestUrl, location }) => {
      const response = await proxy(new NextRequest(requestUrl));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(location);
    },
  );

  it("runs for the sitemap and robots endpoints", () => {
    expect(config.matcher).toContain("/robots.txt");
    expect(config.matcher).toContain("/sitemap.xml");
  });

  it("rewrites an unprefixed English page without redirecting its internal route", async () => {
    // Given: the public English pricing URL and its internal locale route.
    const publicResponse = await proxy(new NextRequest("http://localhost:3100/pricing"));
    // When: Next resolves the rewritten route through the proxy.
    const internalResponse = await proxy(new NextRequest("http://localhost:3100/en/pricing"));
    // Then: the internal route cannot redirect back to the original URL.
    expect(publicResponse.headers.get("x-middleware-rewrite")).toContain("/en/pricing");
    expect(internalResponse.headers.get("location")).toBeNull();
  });
});
