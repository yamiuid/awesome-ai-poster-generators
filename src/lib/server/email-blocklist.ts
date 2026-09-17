/**
 * 一次性邮箱域名列表的解析与匹配。
 *
 * 列表来源：disposable-email-domains（MIT），每周由 /api/cron/blocklist-sync
 * 同步进 public.blocked_email_domains，再由 before_user_created hook 拦截注册。
 */

/** 只接受形如 a.b.com 的普通域名；带协议的脏数据一律丢弃。 */
const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function parseDisposableDomainList(raw: string): string[] {
  const domains = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim().toLowerCase();
    if (value === "" || value.startsWith("#")) {
      continue;
    }
    if (!DOMAIN_PATTERN.test(value)) {
      continue;
    }
    domains.add(value);
  }
  return [...domains];
}

/**
 * 逐级去掉最左标签后的候选域名：a.b.com → ["a.b.com", "b.com"]。
 *
 * 顶级域（com）不进入候选，避免把某条脏数据变成整片域名的封禁。
 * 与 SQL 侧 before_user_created 的匹配规则保持一致。
 */
export function emailDomainCandidates(email: string): string[] {
  const at = email.lastIndexOf("@");
  if (at < 0) {
    return [];
  }
  let candidate = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  const candidates: string[] = [];
  while (candidate.includes(".")) {
    candidates.push(candidate);
    candidate = candidate.slice(candidate.indexOf(".") + 1);
  }
  return candidates;
}
