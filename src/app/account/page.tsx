import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
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
    redirect("/login");
  }
  const client = await createSupabaseServerClient();
  const { data: generations } = await client
    .from("generations")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = generations ?? [];
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
  for (const asset of assets ?? []) {
    imageUrls.set(asset.id, await createPosterUrl(asset.storage_path));
  }
  return (
    <main className="account-page">
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
        </nav>
      </header>
      <section className="account-heading">
        <div>
          <p className="eyebrow">Private history</p>
          <h1>Your directions.</h1>
        </div>
        <p>
          {auth.isPro
            ? "Pro studio / no watermark"
            : "Free account / seven-day history"}
        </p>
      </section>
      <section className="history-grid" aria-label="Generation history">
        {rows.length === 0 && (
          <div className="empty-history">
            <p className="eyebrow">Nothing here yet</p>
            <h2>Your first direction is waiting.</h2>
            <Link className="solid-button" href="/#studio">
              Open the studio
            </Link>
          </div>
        )}
        {rows.map((row) => {
          const rowAssets = assetsByGeneration.get(row.id) ?? [];
          return (
            <article className="history-card" key={row.id}>
              <div className="history-card-head">
                <span>
                  {new Date(row.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span>{row.status.replace("_", " ")}</span>
              </div>
              <p className="history-prompt">{row.prompt}</p>
              {rowAssets.length > 0 && (
                <div className="history-thumbs">
                  {rowAssets.map((asset) => {
                    const url = imageUrls.get(asset.id);
                    return url ? (
                      <Image
                        key={asset.id}
                        src={url}
                        alt={asset.alt_text}
                        width={180}
                        height={225}
                        unoptimized
                      />
                    ) : null;
                  })}
                </div>
              )}
              <div className="history-meta">
                <span>
                  {row.style} / {row.aspect_ratio}
                </span>
                <span>
                  {row.mode === "pro"
                    ? `${row.resolution.toUpperCase()} ${row.quality}`
                    : "Free preview"}
                </span>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
