import { NextResponse } from "next/server";
import { parseDisposableDomainList } from "@/lib/server/email-blocklist";
import { getServerEnv } from "@/lib/server/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";

const BATCH_SIZE = 500;

/**
 * 合并三个主流一次性邮箱清单：任一清单单独都有漏网域名
 * （例如 tempmail.com 不在 disposable-email-domains 里）。
 */
const SOURCES = [
  {
    source: "disposable-email-domains",
    url: "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf",
  },
  {
    source: "mailchecker",
    url: "https://raw.githubusercontent.com/FGRibreau/mailchecker/master/list.txt",
  },
  {
    source: "fakefilter",
    url: "https://raw.githubusercontent.com/7c/fakefilter/main/txt/data.txt",
  },
] as const;

/**
 * 出现在一次性邮箱清单里、但属于真人长期使用的隐私邮箱，不做封禁：
 * keemail.me 是 Tutanota 的别名域，误伤的是付费用户而不是羊毛党。
 */
const PROTECTED_DOMAINS = new Set([
  "keemail.me",
  "tuta.io",
  "tutanota.com",
  "tutanota.de",
]);

export const maxDuration = 300;

/**
 * 把公开的一次性邮箱域名列表同步进 blocked_email_domains。
 *
 * 只增不删：域名列表几乎只增长，而误封一个已经废弃的一次性邮箱域名没有实际代价，
 * 删行反而需要把每次同步的「本次见过」状态写进库。已有的手工/事故域名不会被覆盖。
 */
export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const results: Record<string, string | number> = {};
  let failedSources = 0;

  for (const { source, url } of SOURCES) {
    let domains: string[];
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`list fetch returned ${response.status}`);
      }
      domains = parseDisposableDomainList(await response.text()).filter(
        (domain) => !PROTECTED_DOMAINS.has(domain),
      );
    } catch (error) {
      // 单个清单拉取失败不影响其余清单：保留旧数据总比清空好
      console.error("Disposable domain list fetch failed", source, error);
      results[source] = "fetch failed";
      failedSources += 1;
      continue;
    }

    if (domains.length === 0) {
      console.error("Disposable domain list was empty", source);
      results[source] = "empty list";
      failedSources += 1;
      continue;
    }

    let written = 0;
    let writeFailed = false;
    for (let index = 0; index < domains.length; index += BATCH_SIZE) {
      const rows = domains
        .slice(index, index + BATCH_SIZE)
        .map((domain) => ({ domain, reason: "disposable", source }));
      // ignoreDuplicates：已存在的行（含手工/事故域名）保持原样，同步不做覆盖
      const { error } = await admin
        .from("blocked_email_domains")
        .upsert(rows, { onConflict: "domain", ignoreDuplicates: true });
      if (error) {
        console.error("Blocked domain upsert failed", source, error);
        results[source] = `write failed after ${written}`;
        failedSources += 1;
        writeFailed = true;
        break;
      }
      written += rows.length;
    }
    if (!writeFailed) {
      results[source] = written;
    }
  }

  const { count: total } = await admin
    .from("blocked_email_domains")
    .select("domain", { count: "exact", head: true });

  // 全部清单都失败才算任务失败，否则保留部分成功的结果
  if (failedSources === SOURCES.length) {
    return NextResponse.json(
      { error: "No domain list could be synced.", results },
      { status: 503 },
    );
  }

  return NextResponse.json({ results, total: total ?? 0 });
}
