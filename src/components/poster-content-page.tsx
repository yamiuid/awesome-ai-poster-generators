import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { siteUrl } from "@/lib/seo";

export function PosterContentPage({
  path,
  title,
  intro,
  studioAction,
  contentClassName,
  compactHero = false,
  children,
}: Readonly<{
  path: string;
  title: string;
  intro: string;
  studioAction?: string;
  contentClassName?: string;
  compactHero?: boolean;
  children: ReactNode;
}>) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Text to Poster",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: `${siteUrl}${path}`,
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
          <h2 id="related-heading">Keep creating</h2>
          <p className="style-links">
            <Link href="/">AI poster maker</Link> /{" "}
            <Link href="/movie-poster-maker">Movie poster maker</Link> /{" "}
            <Link href="/event-poster-maker">Event poster maker</Link> /{" "}
            <Link href="/how-to-make-a-poster">How to make a poster</Link> /{" "}
            <Link href="/poster-design-ideas">Poster design ideas</Link>
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
