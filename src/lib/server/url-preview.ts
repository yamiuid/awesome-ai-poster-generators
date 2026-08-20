import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type { Dispatcher } from "undici";
import { ProxyAgent, Socks5ProxyAgent, fetch as undiciFetch } from "undici";
import { type UrlPreview, urlPreviewSchema } from "@/lib/domain/url-preview";
import { AppError } from "./errors";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 6_000;

let proxyDispatcher: Dispatcher | undefined;

// 本地开发网络（如沙箱/公司网络）DNS 可能被劫持，所有域名都解析到内网地址；
// 与 APIMart 客户端一致，配置代理后由代理端解析域名并跳过本地 DNS 预检。
function getProxiedFetch(): typeof fetch | undefined {
  const proxyUrl =
    process.env["APIMART_PROXY"] ??
    process.env["HTTPS_PROXY"] ??
    process.env["https_proxy"];
  if (!proxyUrl) {
    return undefined;
  }
  if (!proxyDispatcher) {
    proxyDispatcher = proxyUrl.trim().toLowerCase().startsWith("socks")
      ? new Socks5ProxyAgent(proxyUrl)
      : new ProxyAgent(proxyUrl);
  }
  const dispatcher = proxyDispatcher;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request =
      input instanceof globalThis.Request
        ? input
        : new globalThis.Request(String(input), init);
    const body =
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.body === null
        ? undefined
        : Buffer.from(await request.arrayBuffer());
    return undiciFetch(request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      dispatcher,
      ...(body === undefined ? {} : { body }),
    } as unknown as Parameters<typeof undiciFetch>[1]);
  }) as unknown as typeof fetch;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  const c = parts[2] ?? 0;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice("::ffff:".length);
    return isIP(v4) === 4 && isPrivateIpv4(v4);
  }
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  // 解析不到或格式未知的地址一律视为内网，拒绝访问
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: readonly LookupAddress[] = [];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(
      "URL_PREVIEW_UNREACHABLE",
      "This link could not be resolved.",
      422,
    );
  }
  if (addresses.length === 0) {
    throw new AppError(
      "URL_PREVIEW_UNREACHABLE",
      "This link could not be resolved.",
      422,
    );
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new AppError(
        "URL_PREVIEW_BLOCKED",
        "This link is not supported.",
        422,
      );
    }
  }
}

export function cleanBodyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function validatePageUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(
      "URL_PREVIEW_INVALID",
      "Please paste a valid link.",
      400,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(
      "URL_PREVIEW_INVALID",
      "Only http(s) links are supported.",
      400,
    );
  }
  return url;
}

export function extractPage(
  html: string,
  baseUrl: string,
): {
  title: string;
  description: string;
  siteName: string;
  favicon?: string;
  ogImage?: string;
  headings: readonly string[];
  content: string;
} {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim();
  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    "";
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || "";
  const faviconHref =
    $('link[rel="icon"]').first().attr("href") ||
    $('link[rel="shortcut icon"]').first().attr("href");
  const ogImageHref =
    $('meta[property="og:image"]').first().attr("content")?.trim() || "";
  $("script, style, noscript, svg, template, iframe, nav, footer").remove();
  const headings = $("h1, h2")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter((heading) => heading.length > 0)
    .slice(0, 10);
  const bodyText = $("body").text() || $("html").text() || "";
  const content = cleanBodyText(bodyText).slice(0, MAX_CONTENT_CHARS);
  return {
    title,
    description,
    siteName,
    ...(faviconHref
      ? { favicon: new URL(faviconHref, baseUrl).toString() }
      : {}),
    ...(ogImageHref
      ? { ogImage: new URL(ogImageHref, baseUrl).toString() }
      : {}),
    headings,
    content,
  };
}

/**
 * 流式读取响应体，累计达到 maxBytes 即停止下载并截断。
 * 大页面不再直接报错，而是只读取前面部分，保证内存占用有上限。
 */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ html: string; truncated: boolean; byteLength: number }> {
  const body = response.body;
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const truncated = buffer.byteLength > maxBytes;
    return {
      html: truncated
        ? buffer.subarray(0, maxBytes).toString("utf8")
        : buffer.toString("utf8"),
      truncated,
      byteLength: truncated ? maxBytes : buffer.byteLength,
    };
  }
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let truncated = false;
  try {
    while (byteLength < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = maxBytes - byteLength;
      if (value.byteLength > remaining) {
        chunks.push(Buffer.from(value.buffer, value.byteOffset, remaining));
        byteLength = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(value));
      byteLength += value.byteLength;
    }
    if (truncated) {
      try {
        await reader.cancel();
      } catch {
        // 取消流失败不影响已读到的内容
      }
    }
  } finally {
    reader.releaseLock();
  }
  return {
    html: Buffer.concat(chunks).toString("utf8"),
    truncated,
    byteLength,
  };
}

export async function fetchPageHtml(
  url: URL,
  options?: { signal?: AbortSignal },
): Promise<{
  html: string;
  status: number;
  contentType: string;
  byteLength: number;
  truncated: boolean;
  finalUrl: URL;
}> {
  const proxiedFetch = getProxiedFetch();
  const usesProxy = proxiedFetch !== undefined;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!usesProxy) {
      await assertPublicHost(current.hostname);
    }
    const response = await (proxiedFetch ?? fetch)(current, {
      redirect: "manual",
      signal: AbortSignal.any([
        AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ...(options?.signal ? [options.signal] : []),
      ]),
      headers: {
        "user-agent": "TextToPosterBot/1.0 (+https://texttoposter.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AppError(
          "URL_PREVIEW_UNREACHABLE",
          "This link redirected without a target.",
          422,
        );
      }
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new AppError(
          "URL_PREVIEW_BLOCKED",
          "This link is not supported.",
          422,
        );
      }
      continue;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new AppError(
        "URL_PREVIEW_NOT_HTML",
        "This link is not a web page.",
        422,
      );
    }
    const { html, truncated, byteLength } = await readBodyCapped(
      response,
      MAX_BYTES,
    );
    return {
      html,
      status: response.status,
      contentType,
      byteLength,
      truncated,
      finalUrl: current,
    };
  }

  throw new AppError(
    "URL_PREVIEW_UNREACHABLE",
    "This link redirected too many times.",
    422,
  );
}

export async function fetchUrlPreview(rawUrl: string): Promise<UrlPreview> {
  const url = validatePageUrl(rawUrl);
  const page = await fetchPageHtml(url);
  const extracted = extractPage(page.html, page.finalUrl.toString());
  return urlPreviewSchema.parse({
    url: page.finalUrl.toString(),
    domain: page.finalUrl.hostname,
    ...extracted,
  });
}
