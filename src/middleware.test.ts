import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "./middleware";

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
      const response = await middleware(new NextRequest(requestUrl));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(location);
    },
  );

  it("runs for the sitemap and robots endpoints", () => {
    expect(config.matcher).toContain("/robots.txt");
    expect(config.matcher).toContain("/sitemap.xml");
  });
});
