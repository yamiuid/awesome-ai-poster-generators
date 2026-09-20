/**
 * 跨运行时的网络辅助（Node / Cloudflare Workers）。
 *
 * workerd 不提供 `node:net` 与 `node:dns`，而 SSRF 预检需要「判断是不是 IP 字面量」
 * 和「把域名解析成地址」。这里用纯 JS 判断 IP，解析则优先走 Node 的 dns：
 * Workers 上该模块加载不到，自动回落到 DNS over HTTPS。两条路径的调用方代码一致。
 */

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DOH_TTL_MS = 60_000;
const dohCache = new Map<string, Readonly<{ at: number; addresses: string[] }>>();

/** 与 node:net 的 isIP 对齐：返回 0（不是 IP）、4 或 6 */
export function ipVersion(value: string): 0 | 4 | 6 {
  if (value === "") {
    return 0;
  }
  if (ipv4Version(value) === 4) {
    return 4;
  }
  return isIpv6(value) ? 6 : 0;
}

function ipv4Version(value: string): 0 | 4 {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return 0;
  }
  for (const part of parts) {
    // 与 node:net 一致：不接受前导零（"01.2.3.4" 不是 IPv4 字面量）
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) {
      return 0;
    }
    if (Number(part) > 255) {
      return 0;
    }
  }
  return 4;
}

function isIpv6(value: string): boolean {
  if (!value.includes(":")) {
    return false;
  }
  const doubleColon = value.indexOf("::");
  if (doubleColon !== -1 && value.indexOf("::", doubleColon + 1) !== -1) {
    return false;
  }
  const parts = doubleColon === -1
    ? { head: value, tail: null }
    : { head: value.slice(0, doubleColon), tail: value.slice(doubleColon + 2) };
  const groups = [
    ...(parts.head === "" ? [] : parts.head.split(":")),
    ...(parts.tail === null || parts.tail === "" ? [] : parts.tail.split(":")),
  ];
  let slots = 0;
  for (const [index, group] of groups.entries()) {
    if (group === "") {
      return false;
    }
    // 末尾允许内嵌 IPv4（::ffff:192.168.0.1），此时占两个 16 位组
    if (index === groups.length - 1 && group.includes(".")) {
      if (ipv4Version(group) !== 4) {
        return false;
      }
      slots += 2;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }
    slots += 1;
  }
  if (parts.tail === null) {
    return slots === 8;
  }
  return slots < 8;
}

/**
 * 解析主机名到全部地址。
 * Node 上走系统 DNS（一次调用，无额外网络开销）；Workers 上走 DoH。
 * 两条路径都失败时按调用方约定抛出，由调用方决定报错文案。
 */
export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  try {
    const { lookup } = await import("node:dns/promises");
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return entries.map((entry) => entry.address);
  } catch {
    return resolveViaDoh(hostname);
  }
}

async function resolveViaDoh(hostname: string): Promise<string[]> {
  const cached = dohCache.get(hostname);
  if (cached && Date.now() - cached.at < DOH_TTL_MS) {
    return [...cached.addresses];
  }
  const addresses: string[] = [];
  let answered = false;
  for (const type of ["A", "AAAA"] as const) {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`DNS lookup failed with status ${response.status}.`);
    }
    const body = (await response.json()) as {
      Status?: number;
      Answer?: ReadonlyArray<{ type?: number; data?: string }>;
    };
    if (body.Status === 0) {
      answered = true;
    }
    for (const answer of body.Answer ?? []) {
      if (answer.data === undefined) {
        continue;
      }
      // 只收 A(1)/AAAA(28)，CNAME(5) 等交给递归解析器自己跟进
      if (answer.type === 1 || answer.type === 28) {
        addresses.push(answer.data);
      }
    }
  }
  if (!answered) {
    throw new Error("DNS lookup returned an error status.");
  }
  dohCache.set(hostname, { at: Date.now(), addresses });
  return addresses;
}
