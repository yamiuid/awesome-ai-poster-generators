import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountTabs } from "@/components/account-tabs";
import { CreditActivity } from "@/components/credit-activity";
import {
  HistoryGallery,
  type HistoryImage,
  type HistoryItem,
} from "@/components/history-gallery";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/lib/i18n/locale";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";
import { getAuthContext } from "@/lib/server/auth";
import {
  getAccountBalance,
  listAccountTransactions,
} from "@/lib/server/credit-ledger";
import { createPosterUrls } from "@/lib/server/storage";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  await resolveRouteLocale(params);
  const t = await getTranslations("account");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

type PageProps = RouteParams & {
  searchParams: Promise<Readonly<{ tab?: string | undefined }>>;
};

export default async function AccountPage({ params, searchParams }: PageProps) {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations("account");
  const auth = await getAuthContext();
  if (!auth.userId) {
    redirect(
      localizedPath(
        `/login?next=${encodeURIComponent(localizedPath("/account", locale))}`,
        locale,
      ),
    );
  }
  const client = await createSupabaseServerClient();
  const [rawSearch, { data: generations }] = await Promise.all([
    searchParams,
    client
      .from("generations")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  // SSR 只读状态，不在此做下载/水印/上传等重活（生产 serverless 会超时）。
  // 推进由前端 HistoryGallery 调 /advance + Vercel cron 双通道完成。
  const rows = generations ?? [];
  const hasPendingGeneration = rows.some((generation) =>
    ["submitted", "processing"].includes(generation.status),
  );
  const ids = rows.map((row) => row.id);
  const { data: assets } =
    ids.length > 0
      ? await client
          .from("generated_assets")
          .select("*")
          .in("generation_id", ids)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order("created_at")
      : { data: [] };
  const assetsByGeneration = new Map<string, typeof assets>();
  for (const asset of assets ?? []) {
    const current = assetsByGeneration.get(asset.generation_id) ?? [];
    current.push(asset);
    assetsByGeneration.set(asset.generation_id, current);
  }
  const imageUrls = new Map<string, string>();
  const allAssets = assets ?? [];
  const signedUrls = await createPosterUrls(
    allAssets.map((asset) => asset.storage_path),
  );
  allAssets.forEach((asset, index) => {
    const url = signedUrls[index];
    if (url) {
      imageUrls.set(asset.id, url);
    }
  });

  // Pro 积分信息：历史卡 chip 需要每次生成的 reserved + consumed；
  // Credits Tab 需要余额与完整交易列表
  const [balance, transactions, consumedRows] = await Promise.all([
    getAccountBalance(client, auth.userId),
    listAccountTransactions(client, auth.userId, 50),
    ids.length > 0
      ? client
          .from("credit_transactions")
          .select("generation_id, amount")
          .in("generation_id", ids)
          .eq("kind", "consume")
      : Promise.resolve({ data: [] }),
  ]);
  const consumedByGeneration = new Map<string, number>();
  for (const row of consumedRows.data ?? []) {
    if (!row.generation_id) {
      continue;
    }
    consumedByGeneration.set(
      row.generation_id,
      (consumedByGeneration.get(row.generation_id) ?? 0) + row.amount,
    );
  }

  const items: HistoryItem[] = rows.map((row) => {
    const rowAssets = assetsByGeneration.get(row.id) ?? [];
    const images: HistoryImage[] = rowAssets.flatMap((asset) => {
      const url = imageUrls.get(asset.id);
      return url
        ? [
            {
              id: asset.id,
              url,
              alt: asset.alt_text,
              watermarked: asset.watermarked,
            },
          ]
        : [];
    });
    return {
      id: row.id,
      prompt: row.prompt,
      createdAt: row.created_at,
      status: row.status,
      images,
      mode: row.mode,
      creditsReserved: row.reserved_credits,
      creditsConsumed: consumedByGeneration.get(row.id),
    };
  });

  const tab = rawSearch.tab === "credits" ? "credits" : "generations";
  // 订阅档位名称直接复用 account 命名空间里的 creator / studio / scale
  const planTierLabel =
    balance?.planTier === "creator" ||
    balance?.planTier === "studio" ||
    balance?.planTier === "scale"
      ? t(balance.planTier)
      : null;
  const expiredTierLabel =
    balance?.expired?.tier === "creator" ||
    balance?.expired?.tier === "studio" ||
    balance?.expired?.tier === "scale"
      ? t(balance.expired.tier)
      : null;
  const formatDate = (value: string): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(value),
    );
  return (
    <main className="account-page">
      {hasPendingGeneration && <meta httpEquiv="refresh" content="5" />}
      <SiteHeader initialAuth={auth} />
      <section className="account-heading">
        <div>
          <p className="eyebrow">{t("privateHistory")}</p>
          <h1>{t("yourDirections")}</h1>
        </div>
        <p>
          {auth.email ? `${auth.email} · ` : ""}
          {auth.isPro
            ? t("proStudio")
            : planTierLabel && balance?.expired
              ? t("planEnded", { tier: planTierLabel })
              : t("freeHistory")}
        </p>
      </section>
      {balance && (
        <div className="account-balance">
          <p className="eyebrow">{t("availableCredits")}</p>
          <p className="account-balance-number">{balance.available}</p>
          {balance.bucket === "permanent" ? (
            <p className="account-balance-meta">
              {t("permanentBalanceMeta", { credits: balance.granted })}
            </p>
          ) : (
            <p className="account-balance-meta">
              {t("subscriptionBalanceMeta", {
                tier: balance.tier,
                credits: balance.granted,
                periodStart: balance.periodStart ?? "",
                periodEnd: balance.periodEnd ?? "",
              })}
            </p>
          )}
          {balance.expired && (
            <p className="account-balance-expired">
              {t("expiredPlanCredits", {
                tier: expiredTierLabel ?? "",
                credits: balance.expired.available,
                date: formatDate(balance.expired.periodEnd),
              })}
            </p>
          )}
          <div className="account-balance-actions">
            {!auth.isPro && (
              <Link className="solid-button" href="/pricing">
                {auth.subscriptionState === "none"
                  ? t("upgradePlan")
                  : t("renewPlan")}
              </Link>
            )}
            <Link className="outline-button" href="/pricing#credit-packs">
              {t("buyCredits")}
            </Link>
          </div>
        </div>
      )}
      <AccountTabs
        initialTab={tab}
        panes={[
          {
            id: "generations",
            label: t("generations"),
            content:
              items.length === 0 ? (
                <div className="empty-history">
                  <p className="eyebrow">{t("nothingHere")}</p>
                  <h2>{t("firstDirection")}</h2>
                  <Link className="solid-button" href="/#studio">
                    {t("openStudio")}
                  </Link>
                </div>
              ) : (
                <HistoryGallery items={items} />
              ),
          },
          {
            id: "credits",
            label: t("credits"),
            content: (
              <CreditActivity transactions={transactions} isPro={auth.isPro} />
            ),
          },
        ]}
      />
    </main>
  );
}
