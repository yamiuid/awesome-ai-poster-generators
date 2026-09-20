import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PosterStudio } from "@/components/poster-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { STYLE_LANDINGS, type StyleLanding } from "@/lib/domain/style-landing";
import { getStyleLandingCopy } from "@/lib/domain/style-landing-copy";
import { toUiLocale } from "@/lib/i18n/locale";
import { siteUrl } from "@/lib/seo";

/**
 * 风格落地页 + 内嵌生成器。
 * 版式与 /movie-poster-maker 一致（沿用同一套 movie-* 布局类），
 * 文案取自 landing 与本地化副本，风格页之间不再重复实现。
 */
export async function StyleStudioLanding({
  landing,
}: Readonly<{ landing: StyleLanding }>) {
  const locale = toUiLocale(await getLocale());
  const styles = await getTranslations("styles");
  const style = styles(landing.style);
  const copy = getStyleLandingCopy(locale, style, landing);
  const ctaEvent = `${landing.style}_cta_click`;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  const breadcrumbJsonLd = {
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
        name: copy.h1,
        item: `${siteUrl}/${landing.slug}`,
      },
    ],
  };
  const otherLandings = STYLE_LANDINGS.filter(
    (item) => item.slug !== landing.slug,
  );

  return (
    <main className="legal-page movie-page">
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <SiteHeader />

      <article className="legal-copy movie-landing-copy">
        <nav className="breadcrumbs" aria-label={styles("moreHeading")}>
          <Link href="/">Text to Poster</Link>
          <span aria-hidden="true">/</span>
          <span>{style}</span>
        </nav>

        <section className="movie-hero" aria-labelledby="style-heading">
          <p className="eyebrow">{styles("eyebrow", { style })}</p>
          <h1 id="style-heading">{copy.h1}</h1>
          <p className="legal-intro">{copy.intro}</p>
          <a
            className="solid-button"
            href="#studio"
            data-umami-event={ctaEvent}
          >
            {styles("tryAction", { style })} <ArrowUpRight size={15} />
          </a>
        </section>

        <section
          className="movie-studio-section"
          aria-label={styles("tryHeading")}
        >
          <div className="movie-studio-intro">
            <p className="eyebrow">{styles("tryHeading")}</p>
            <h2 id="style-studio-heading">
              {styles("promptHeading", { style })}
            </h2>
            <p>{copy.cta}</p>
          </div>
          <PosterStudio initialStyle={landing.style} />
        </section>

        <section aria-labelledby="style-prompt-heading">
          <h2 id="style-prompt-heading">
            {styles("promptHeading", { style })}
          </h2>
          <p>{copy.promptLead}</p>
          <ul className="style-landing-list">
            {copy.promptTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="style-faq-heading">
          <h2 id="style-faq-heading">{styles("faqHeading", { style })}</h2>
          <div className="faq-list">
            {copy.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="style-cta-heading">
          <h2 id="style-cta-heading">{styles("tryHeading")}</h2>
          <p>{copy.cta}</p>
          <a
            className="solid-button"
            href="#studio"
            data-umami-event={ctaEvent}
          >
            {styles("tryAction", { style })} <ArrowUpRight size={15} />
          </a>
        </section>

        <section aria-labelledby="style-more-heading">
          <h2 id="style-more-heading">{styles("moreHeading")}</h2>
          <p className="style-links">
            {otherLandings.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? " / " : ""}
                <Link href={`/${item.slug}`}>{styles(item.style)}</Link>
              </span>
            ))}
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
