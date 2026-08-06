import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  HistoryGallery,
  type HistoryImage,
  type HistoryItem,
} from "@/components/history-gallery";
import { UserMenu } from "@/components/user-menu";
import { getAuthContext } from "@/lib/server/auth";
import { createPosterUrl } from "@/lib/server/storage";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = {
  title: "History | Text to Poster",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const auth = await getAuthContext();
  if (!auth.userId) {
    redirect("/login?next=/account");
  }
  const client = await createSupabaseServerClient();
  const { data: generations } = await client
    .from("generations")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(30);
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
  const signedUrls = await Promise.all(
    allAssets.map((asset) => createPosterUrl(asset.storage_path)),
  );
  allAssets.forEach((asset, index) => {
    const url = signedUrls[index];
    if (url) {
      imageUrls.set(asset.id, url);
    }
  });
  const items: HistoryItem[] = (rows ?? []).map((row) => {
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
    };
  });
  return (
    <main className="account-page">
      {hasPendingGeneration && <meta httpEquiv="refresh" content="5" />}
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </Link>
        <nav className="header-nav">
          <Link href="/account/billing">Billing</Link>
          <Link className="header-cta" href="/#studio">
            New brief
          </Link>
          <UserMenu email={auth.email} avatarUrl={auth.avatarUrl} />
        </nav>
      </header>
      <section className="account-heading">
        <div>
          <p className="eyebrow">Private history</p>
          <h1>Your directions.</h1>
        </div>
        <p>
          {auth.email ? `${auth.email} · ` : ""}
          {auth.isPro
            ? "Pro studio / no watermark"
            : "Free account / seven-day history"}
        </p>
      </section>
      {items.length === 0 && (
        <div className="empty-history">
          <p className="eyebrow">Nothing here yet</p>
          <h2>Your first direction is waiting.</h2>
          <Link className="solid-button" href="/#studio">
            Open the studio
          </Link>
        </div>
      )}
      {items.length > 0 && <HistoryGallery items={items} />}
    </main>
  );
}
