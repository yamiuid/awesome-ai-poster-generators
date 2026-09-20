import type { Dispatcher } from "undici";

/**
 * 本地开发用的出网代理（如 v2rayN 的 socks5://127.0.0.1:10909）。
 *
 * 只有显式配置了 APIMART_PROXY / HTTPS_PROXY 才启用；Workers 上既不会配置这些变量，
 * 也加载不了 undici 的原生 agent，所以这段代码在边缘运行时是死代码——因此这里改成
 * 「用到时才动态 import undici」，既避免 undici 被静态打进 Worker 冷启动路径，
 * 也保证两个运行时共用同一份实现。
 */
function proxyUrl(): string | undefined {
  return (
    process.env["APIMART_PROXY"] ??
    process.env["HTTPS_PROXY"] ??
    process.env["https_proxy"]
  );
}

export function hasOutboundProxy(): boolean {
  return Boolean(proxyUrl());
}

type ProxiedRuntime = Readonly<{
  fetch: typeof fetch;
  dispatcher: Dispatcher;
}>;

let dispatcher: Dispatcher | undefined;

async function loadProxiedRuntime(url: string): Promise<ProxiedRuntime> {
  const undici = await import("undici");
  dispatcher ??= url.trim().toLowerCase().startsWith("socks")
    ? new undici.Socks5ProxyAgent(url)
    : new undici.ProxyAgent(url);
  return { fetch: undici.fetch as unknown as typeof fetch, dispatcher };
}

/**
 * 返回挂上代理 dispatcher 的 fetch；没有配置代理时返回 undefined（调用方走直连）。
 */
export function createProxiedFetch(): typeof fetch | undefined {
  const url = proxyUrl();
  if (!url) {
    return undefined;
  }
  let runtime: Promise<ProxiedRuntime> | undefined;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    runtime ??= loadProxiedRuntime(url);
    const { fetch: undiciFetch, dispatcher: agent } = await runtime;
    const request =
      input instanceof globalThis.Request
        ? input
        : new globalThis.Request(String(input), init);
    const body =
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.body === null
        ? undefined
        : await request.arrayBuffer();
    return undiciFetch(request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      dispatcher: agent,
      ...(body === undefined ? {} : { body }),
    } as unknown as Parameters<typeof undiciFetch>[1]);
  }) as typeof fetch;
}
