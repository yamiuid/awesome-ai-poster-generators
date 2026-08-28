import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { STYLE_LANDINGS, type StyleLanding } from "@/lib/domain/style-landing";
import { getStyleLandingCopy } from "@/lib/domain/style-landing-copy";
import { isUiLocale, type UiLocale } from "@/lib/i18n/locale";

export async function StyleLandingPage({
  landing,
}: Readonly<{ landing: StyleLanding }>) {
  const t = await getTranslations("styles");
  const rawLocale = await getLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const style = t(landing.style);
  const exampleCopyKeys: Readonly<
    { movie: Readonly<{ prompt: string; alt: string }> } & Record<
      string,
      Readonly<{ prompt: string; alt: string }>
    >
  > = {
    movie: { prompt: "exampleMoviePrompt", alt: "exampleMovieAlt" },
    minimal: { prompt: "exampleMinimalPrompt", alt: "exampleMinimalAlt" },
    anime: { prompt: "exampleAnimePrompt", alt: "exampleAnimeAlt" },
    business: { prompt: "exampleBusinessPrompt", alt: "exampleBusinessAlt" },
    vintage: { prompt: "exampleVintagePrompt", alt: "exampleVintageAlt" },
    neon: { prompt: "exampleNeonPrompt", alt: "exampleNeonAlt" },
  } as const;
  const copy = getStyleLandingCopy(locale, style, landing);
  const example =
    POSTER_EXAMPLES.find((item) => item.style === landing.style) ??
    POSTER_EXAMPLES[0];
  const exampleCopy = example
    ? (exampleCopyKeys[example.style] ?? exampleCopyKeys["movie"])
    : exampleCopyKeys["movie"];
  const otherLandings = STYLE_LANDINGS.filter(
    (item) => item.slug !== landing.slug,
  );

  return (
    <main className="legal-page">
      <SiteHeader />

      <article className="legal-copy">
        <p className="eyebrow">{t("eyebrow", { style })}</p>
        <h1>{copy.h1}</h1>
        <p className="legal-intro">{copy.intro}</p>

        {example && (
          <figure className="example-poster style-example">
            <Image
              className="example-poster-image"
              src={example.image}
              alt={t(exampleCopy.alt)}
              width={1024}
              height={1280}
              sizes="(max-width: 640px) 100vw, 420px"
            />
            <figcaption>
              <span className="eyebrow">{style}</span>
              <p>{t(exampleCopy.prompt)}</p>
            </figcaption>
          </figure>
        )}

        <section>
          <h2>{t("promptHeading", { style })}</h2>
          <p>{copy.promptLead}</p>
          <ul className="style-landing-list">
            {copy.promptTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{t("faqHeading", { style })}</h2>
          <div className="faq-list">
            {copy.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h2>{t("tryHeading")}</h2>
          <p>{copy.cta}</p>
          <Link className="solid-button" href="/#studio">
            {t("tryAction", { style })}
          </Link>
        </section>

        <section>
          <h2>{t("moreHeading")}</h2>
          <p className="style-links">
            {otherLandings.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? " / " : ""}
                <Link href={`/${item.slug}`}>{t(item.style)}</Link>
              </span>
            ))}
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
