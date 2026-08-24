import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { STYLE_LANDINGS, type StyleLanding } from "@/lib/domain/style-landing";

export function StyleLandingPage({
  landing,
}: Readonly<{ landing: StyleLanding }>) {
  const example =
    POSTER_EXAMPLES.find((item) => item.style === landing.style) ??
    POSTER_EXAMPLES[0];
  const otherLandings = STYLE_LANDINGS.filter(
    (item) => item.slug !== landing.slug,
  );

  return (
    <main className="legal-page">
      <header className="site-header">
        <Link className="wordmark" href="/">
          <LogoMark className="wordmark-mark" />
          <span>Text to Poster</span>
        </Link>
        <Link className="header-cta" href="/#studio">
          Open studio
        </Link>
      </header>

      <article className="legal-copy">
        <p className="eyebrow">Text to Poster / {landing.label}</p>
        <h1>{landing.h1}</h1>
        <p className="legal-intro">{landing.intro}</p>

        {example && (
          <figure className="example-poster style-example">
            <Image
              className="example-poster-image"
              src={example.image}
              alt={example.alt}
              width={1024}
              height={1280}
              sizes="(max-width: 640px) 100vw, 420px"
            />
            <figcaption>
              <span className="eyebrow">{example.label}</span>
              <p>{example.prompt}</p>
            </figcaption>
          </figure>
        )}

        <section>
          <h2>How to write a {landing.label.toLowerCase()} poster prompt</h2>
          <p>{landing.promptLead}</p>
          <ul className="style-landing-list">
            {landing.promptTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{landing.label} poster FAQs</h2>
          <div className="faq-list">
            {landing.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h2>Try it in the studio</h2>
          <p>{landing.cta}</p>
          <Link className="solid-button" href="/#studio">
            Start a {landing.label.toLowerCase()} brief
          </Link>
        </section>

        <section>
          <h2>More poster styles</h2>
          <p className="style-links">
            {otherLandings.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? " / " : ""}
                <Link href={`/${item.slug}`}>{item.linkLabel}</Link>
              </span>
            ))}
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
