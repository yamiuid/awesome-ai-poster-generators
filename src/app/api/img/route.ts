import { type NextRequest } from "next/server";
import { getCloudflareImages } from "@/lib/server/image-ops";
import { isAllowedImageHost } from "@/lib/server/image-hosts";
import { getServerEnv } from "@/lib/server/env";

/**
 * 图片变换路由（当前未被 next/image 引用，见 src/lib/image-loader.ts 的说明）。
 *
 * 为什么不用 /_next/image：vinext 的内置优化器只接受同源相对路径，远程 R2 图片
 * 一律 400。这里自己抓源图 → 交给 Cloudflare Images 缩放/转码（Worker 不做像素
 * 运算）→ 结果写进 Workers Cache，之后命中不再消耗 CPU。
 */

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const MAX_WIDTH = 2048;
const MIN_WIDTH = 16;
/** 每张原图最多缓存 4 种宽度 × 3 种格式的变换结果 */
const MAX_FORMATS = new Set(["image/avif", "image/webp", "image/jpeg"]);

type Target =
  | Readonly<{ kind: "asset"; pathname: string }>
  | Readonly<{ kind: "remote"; href: string }>;

function resolveTarget(
  rawUrl: string,
  requestUrl: string,
): Target | undefined {
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) {
    return { kind: "asset", pathname: rawUrl };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") {
    return undefined;
  }
  const env = getServerEnvOrUndefined();
  if (!isAllowedImageHost(parsed.hostname, env?.R2_PUBLIC_BASE_URL)) {
    return undefined;
  }
  // 保持查询参数（签名 URL 会用到），但不接受锚点
  parsed.hash = "";
  return { kind: "remote", href: parsed.toString() };
}

function getServerEnvOrUndefined(): ReturnType<typeof getServerEnv> | undefined {
  try {
    return getServerEnv();
  } catch {
    // 本地/未配置环境下不阻断图片请求，只是失去 R2 回退域名的放行
    return undefined;
  }
}

function negotiateFormat(accept: string | null): string {
  if (accept?.includes("image/avif")) {
    return "image/avif";
  }
  if (accept?.includes("image/webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

async function fetchSource(
  target: Target,
  request: NextRequest,
): Promise<Response | undefined> {
  if (target.kind === "remote") {
    const response = await fetch(target.href, { redirect: "follow" });
    return response.ok ? response : undefined;
  }
  // 站内资源：优先走 Workers 静态资源绑定，Node/Vercel 上回退到同源 fetch
  try {
    const specifier = ["cloudflare", "workers"].join(":");
    const module = (await import(/* @vite-ignore */ specifier)) as {
      env?: { ASSETS?: { fetch(input: RequestInfo | URL): Promise<Response> } };
    };
    const assets = module.env?.ASSETS;
    if (assets) {
      return await assets.fetch(new URL(target.pathname, request.url));
    }
  } catch {
    // 非 Workers 运行时继续走下面
  }
  const response = await fetch(new URL(target.pathname, request.url));
  return response.ok ? response : undefined;
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const rawUrl = params.get("url");
  const width = Number(params.get("w") ?? "");
  const quality = Number(params.get("q") ?? 75);
  if (
    !rawUrl ||
    !Number.isFinite(width) ||
    width < MIN_WIDTH ||
    width > MAX_WIDTH ||
    !Number.isFinite(quality) ||
    quality < 1 ||
    quality > 100
  ) {
    return new Response("Bad Request", { status: 400 });
  }
  const target = resolveTarget(rawUrl, request.url);
  if (!target) {
    return new Response("Bad Request", { status: 400 });
  }
  const format = negotiateFormat(request.headers.get("accept"));
  if (!MAX_FORMATS.has(format)) {
    return new Response("Bad Request", { status: 400 });
  }

  const cacheKey = new Request(
    `${request.nextUrl.origin}/api/img?url=${encodeURIComponent(rawUrl)}&w=${width}&q=${quality}&f=${format}`,
  );
  const cache =
    typeof caches === "undefined"
      ? undefined
      : (caches as unknown as { default?: Cache }).default;
  const cached = await cache?.match(cacheKey);
  if (cached) {
    return cached;
  }

  const source = await fetchSource(target, request);
  if (!source?.body) {
    return new Response("Image not found", { status: 404 });
  }
  const images = await getCloudflareImages();
  if (!images) {
    // 没有 Images binding（例如本地 Node）时退回原图，保证不出现裂图
    return new Response(source.body, {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": source.headers.get("content-type") ?? "image/png",
      },
    });
  }
  try {
    const output = await images
      .input(source.body)
      .transform({ width })
      .output({ format, quality })
      .then((handle) => handle.response());
    const headers = new Headers(output.headers);
    headers.set("Cache-Control", CACHE_CONTROL);
    headers.set("Vary", "Accept");
    headers.set("X-Content-Type-Options", "nosniff");
    const response = new Response(output.body, { status: 200, headers });
    if (cache) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    console.error("Image transform failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return new Response(source.body, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": source.headers.get("content-type") ?? "image/png",
      },
    });
  }
}
