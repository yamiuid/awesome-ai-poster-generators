import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { localizedPath, type UiLocale } from "@/lib/i18n/locale";
import { siteUrl } from "@/lib/seo";

export async function PosterContentPage({
  path,
  title,
  intro,
  studioAction,
  contentClassName,
  compactHero = false,
  locale = "en",
  children,
}: Readonly<{
  path: string;
  title: string;
  intro: string;
  studioAction?: string;
  contentClassName?: string;
  compactHero?: boolean;
  locale?: UiLocale;
  children: ReactNode;
}>) {
  const t = await getTranslations({ locale, namespace: "posterIdeas" });
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Text to Poster",
        item: `${siteUrl}${localizedPath("/", locale)}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: `${siteUrl}${localizedPath(path, locale)}`,
      },
    ],
  };
  return (
    <main className="legal-page movie-page">
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      <SiteHeader />
      <article
        className={`legal-copy movie-landing-copy ${contentClassName ?? ""}`}
      >
        {!compactHero && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Text to Poster</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>
        )}
        <section className="movie-hero">
          {!compactHero && (
            <p className="eyebrow">Text to Poster / AI poster design</p>
          )}
          <h1>{title}</h1>
          <p className="legal-intro">{intro}</p>
          {studioAction && (
            <a className="solid-button" href="#studio">
              {studioAction} <ArrowUpRight size={15} />
            </a>
          )}
        </section>
        {children}
        <section aria-labelledby="related-heading">
          <h2 id="related-heading">{t("related")}</h2>
          <p className="style-links">
            <Link href="/">{t("maker")}</Link> /{" "}
            <Link href="/movie-poster-maker">
              {t("tools.movie-poster-maker")}
            </Link>{" "}
            /{" "}
            <Link href="/event-poster-maker">
              {t("tools.event-poster-maker")}
            </Link>{" "}
            / <Link href="/how-to-make-a-poster">{t("tutorial")}</Link> /{" "}
            <Link href="/poster-design-ideas">{t("title")}</Link>
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
