import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { extractPage, fetchUrlPreview, isPrivateAddress } from "./url-preview";

describe("isPrivateAddress", () => {
  it("rejects private and reserved IPv4 ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("169.254.1.1")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
  });

  it("rejects private and link-local IPv6 addresses", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd12:3456::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("handles IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("extractPage", () => {
  it("extracts og metadata, favicon, and cleaned body text", () => {
    const html = `
      <html>
        <head>
          <title>Plain Title</title>
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="OG Description" />
          <meta property="og:site_name" content="Example Site" />
          <link rel="icon" href="/favicon.png" />
        </head>
        <body>
          <nav>Menu links</nav>
          <h1>Hello</h1>
          <p>Some   body
            text.</p>
          <script>alert("remove me")</script>
        </body>
      </html>`;
    const result = extractPage(html, "https://example.com/post");
    expect(result.title).toBe("OG Title");
    expect(result.description).toBe("OG Description");
    expect(result.siteName).toBe("Example Site");
    expect(result.favicon).toBe("https://example.com/favicon.png");
    expect(result.content).toContain("Hello Some body text.");
    expect(result.content).not.toContain("remove me");
    expect(result.content).not.toContain("Menu links");
  });

  it("falls back to title and meta description", () => {
    const html = `
      <html>
        <head>
          <title>Fallback Title</title>
          <meta name="description" content="Fallback Description" />
        </head>
        <body><p>Only body text here.</p></body>
      </html>`;
    const result = extractPage(html, "https://example.com/");
    expect(result.title).toBe("Fallback Title");
    expect(result.description).toBe("Fallback Description");
    expect(result.siteName).toBe("");
    expect(result.content).toBe("Only body text here.");
  });

  it("extracts a Chinese article while dropping navigation noise", () => {
    const html = `
      <html>
        <head>
          <title>电影《牛来》因粗劣动画爆红网络 - BBC News 中文</title>
          <meta property="og:title" content="电影《牛来》因粗劣动画爆红网络" />
          <meta property="og:description" content="令人发笑的粗糙动画反而爆红。" />
          <meta property="og:site_name" content="BBC News 中文" />
          <meta property="og:image" content="/news/1200/branded.jpg" />
        </head>
        <body>
          <nav><h2>主页</h2><h2>国际</h2></nav>
          <article>
            <h1>“烂到爆红”的动画电影成为中国票房黑马</h1>
            <p>这部低成本电影因其粗糙的动画和复杂的剧情在网路上疯传后，票房开始飙升。</p>
          </article>
          <footer><h2>更多相关内容</h2></footer>
          <script>alert("remove me")</script>
        </body>
      </html>`;
    const result = extractPage(
      html,
      "https://www.bbc.com/zhongwen/articles/c07rl9x87lvo/simp",
    );
    expect(result.title).toBe("电影《牛来》因粗劣动画爆红网络");
    expect(result.siteName).toBe("BBC News 中文");
    expect(result.ogImage).toBe("https://www.bbc.com/news/1200/branded.jpg");
    expect(result.headings).toEqual(["“烂到爆红”的动画电影成为中国票房黑马"]);
    expect(result.content).toContain("票房开始飙升");
    expect(result.content).not.toContain("主页");
    expect(result.content).not.toContain("remove me");
  });
});

describe("fetchUrlPreview", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.mocked(lookup).mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("rejects private hosts before fetching", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as unknown as LookupAddress);
    await expect(fetchUrlPreview("https://example.com/")).rejects.toMatchObject(
      { code: "URL_PREVIEW_BLOCKED" },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows one redirect and extracts the page", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as LookupAddress);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/final" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          "<html><head><title>Final Page</title></head><body><p>Body text.</p></body></html>",
          { headers: { "content-type": "text/html" } },
        ),
      );
    const preview = await fetchUrlPreview("https://example.com/start");
    expect(preview.title).toBe("Final Page");
    expect(preview.content).toBe("Body text.");
    expect(preview.url).toBe("https://example.com/final");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects non-HTML content", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as LookupAddress);
    fetchMock.mockResolvedValue(
      new Response("png-bytes", {
        headers: { "content-type": "image/png" },
      }),
    );
    await expect(
      fetchUrlPreview("https://example.com/a.png"),
    ).rejects.toMatchObject({ code: "URL_PREVIEW_NOT_HTML" });
  });
});
