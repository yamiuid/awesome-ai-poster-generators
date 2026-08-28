import { ArrowUpRight, MoveDown } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PosterStudio } from "@/components/poster-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { isPosterStyle } from "@/lib/domain/poster";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { STYLE_LANDINGS } from "@/lib/domain/style-landing";
import { isUiLocale, localizedPath } from "@/lib/i18n/locale";
import { pageMeta, siteUrl } from "@/lib/seo";
import { getAuthContext } from "@/lib/server/auth";

export async function generateMetadata() {
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("home");
  return pageMeta({
    title: `${t("heroTitle")} | Text to Poster`,
    description: t("heroBody"),
    path: "/",
    locale,
  });
}

const howToSteps = [
  {
    label: "01 / BRIEF",
    title: "Describe a clear poster brief.",
    body: "Name the subject, audience, feeling, and any words that matter. A short brief gives the AI poster generator enough direction to build a useful first layout.",
    image: "/how-to/write-brief.svg",
    alt: "A poster brief with fields for subject, audience, mood, and headline.",
  },
  {
    label: "02 / STYLE",
    title: "Choose a style and format.",
    body: "Choose the art direction and format that fit the message, from minimal to neon. Match the ratio to its final home: feed, screen, print, or story.",
    image: "/how-to/choose-style.svg",
    alt: "Poster style cards and format controls arranged beside a creative brief.",
  },
  {
    label: "03 / GENERATE",
    title: "Generate multiple directions.",
    body: "Generate a range of compositions from the same brief. Compare the clearest subject, strongest hierarchy, and best balance of image and words.",
    image: "/how-to/generate-directions.svg",
    alt: "Multiple generated poster directions shown as a comparison grid.",
  },
  {
    label: "04 / KEEP",
    title: "Download your favorite direction.",
    body: "Keep the direction that lands, refine the brief, and download. Free previews are watermarked; Pro adds private history and clean high-definition exports.",
    image: "/how-to/download-poster.svg",
    alt: "A finished poster being downloaded from the poster studio.",
  },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    error_description?: string;
    style?: string;
  }>;
}) {
  // Supabase 的 site_url 错误兜底跳转到根路径（?error=...），转发到登录页显示原因
  const params = await searchParams;
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("home");
  const styles = await getTranslations("styles");
  const authError = params.error_description ?? params.error;
  if (authError) {
    redirect(
      localizedPath(`/login?error=${encodeURIComponent(authError)}`, locale),
    );
  }
  const initialStyle =
    params.style && isPosterStyle(params.style) ? params.style : undefined;
  const auth = await getAuthContext();
  const localizedFaqs = [
    [t("faq1Question"), t("faq1Answer")],
    [t("faq2Question"), t("faq2Answer")],
    [t("faq3Question"), t("faq3Answer")],
    [t("faq4Question"), t("faq4Answer")],
    [t("faq5Question"), t("faq5Answer")],
    [t("faq6Question"), t("faq6Answer")],
    [t("faq7Question"), t("faq7Answer")],
  ] as const;
  const localizedHowToSteps = [
    {
      ...howToSteps[0],
      label: t("howBriefLabel"),
      title: t("howBriefTitle"),
      body: t("howBriefBody"),
      alt: t("howBriefAlt"),
    },
    {
      ...howToSteps[1],
      label: t("howStyleLabel"),
      title: t("howStyleTitle"),
      body: t("howStyleBody"),
      alt: t("howStyleAlt"),
    },
    {
      ...howToSteps[2],
      label: t("howGenerateLabel"),
      title: t("howGenerateTitle"),
      body: t("howGenerateBody"),
      alt: t("howGenerateAlt"),
    },
    {
      ...howToSteps[3],
      label: t("howKeepLabel"),
      title: t("howKeepTitle"),
      body: t("howKeepBody"),
      alt: t("howKeepAlt"),
    },
  ] as const;
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
  const exampleCopy = (
    style: string,
  ): Readonly<{ prompt: string; alt: string }> =>
    exampleCopyKeys[style] ?? exampleCopyKeys["movie"];
  const applicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Text to Poster",
    url: `${siteUrl}${localizedPath("/", locale)}`,
    applicationCategory: "DesignApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: "19.90",
      priceCurrency: "USD",
      offerCount: 5,
    },
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: localizedFaqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(applicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SiteHeader initialAuth={auth} />

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">{t("heroEyebrow")}</p>
            <h1 id="hero-heading">{t("heroTitle")}</h1>
          </div>
          <div className="hero-copy">
            <p>{t("heroBody")}</p>
            <div className="hero-note">
              <span>01</span>
              <p>{t("heroNote")}</p>
            </div>
            <div className="hero-actions">
              <a
                className="solid-button"
                href="#studio"
                data-umami-event="hero_generate_click"
              >
                {t("generate")} <MoveDown size={15} />
              </a>
              <a className="pricing-link" href="#examples">
                {t("seeExamples")} <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="hero-types">{t("heroTypes")}</p>
          </div>
        </div>
      </section>

      <PosterStudio
        isPro={auth.isPro}
        isGuest={!auth.userId}
        {...(initialStyle ? { initialStyle } : {})}
      />

      <section
        className="content-section use-cases-section"
        id="use-cases"
        aria-labelledby="use-cases-heading"
      >
        <p className="eyebrow">{t("useCasesEyebrow")}</p>
        <h2 id="use-cases-heading">{t("useCasesTitle")}</h2>
        <p className="section-intro">{t("useCasesIntro")}</p>
        <div className="comparison-grid use-cases-grid">
          <Link className="use-case-card" href="/movie-poster-maker">
            <article>
              <span className="eyebrow">{t("movieEyebrow")}</span>
              <h3>{t("movieTitle")}</h3>
              <p>{t("movieBody")}</p>
              <span className="solid-button use-case-action">
                {t("movieAction")} <ArrowUpRight size={15} />
              </span>
            </article>
          </Link>
          <article>
            <span className="eyebrow">{t("eventsEyebrow")}</span>
            <h3>{t("eventsTitle")}</h3>
            <p>{t("eventsBody")}</p>
          </article>
          <Link className="use-case-card" href="/business-poster-generator">
            <article>
              <span className="eyebrow">{t("businessEyebrow")}</span>
              <h3>{t("businessTitle")}</h3>
              <p>{t("businessBody")}</p>
              <span className="solid-button use-case-action">
                {t("businessAction")} <ArrowUpRight size={15} />
              </span>
            </article>
          </Link>
          <article>
            <span className="eyebrow">{t("socialEyebrow")}</span>
            <h3>{t("socialTitle")}</h3>
            <p>{t("socialBody")}</p>
          </article>
        </div>
      </section>

      <section
        className="content-section url-poster-section"
        id="url-poster"
        aria-labelledby="url-poster-heading"
      >
        <p className="eyebrow">{t("urlEyebrow")}</p>
        <div className="split-heading">
          <h2 id="url-poster-heading">{t("urlTitle")}</h2>
          <p>{t("urlBody")}</p>
        </div>
        <ol className="content-grid url-poster-steps">
          <li>
            <article>
              <span className="eyebrow">{t("urlStep1Label")}</span>
              <h3>{t("urlStep1Title")}</h3>
              <p>{t("urlStep1Body")}</p>
            </article>
          </li>
          <li>
            <article>
              <span className="eyebrow">{t("urlStep2Label")}</span>
              <h3>{t("urlStep2Title")}</h3>
              <p>{t("urlStep2Body")}</p>
            </article>
          </li>
          <li>
            <article>
              <span className="eyebrow">{t("urlStep3Label")}</span>
              <h3>{t("urlStep3Title")}</h3>
              <p>{t("urlStep3Body")}</p>
            </article>
          </li>
        </ol>
        <p className="url-poster-cta">
          <a className="pricing-link" href="#studio">
            {t("urlAction")} <ArrowUpRight size={15} />
          </a>
        </p>
      </section>

      <section
        className="content-section what-is-section"
        id="what-is"
        aria-labelledby="what-is-heading"
      >
        <p className="eyebrow">{t("whatEyebrow")}</p>
        <div className="split-heading">
          <h2 id="what-is-heading">{t("whatTitle")}</h2>
          <p>{t("whatBody")}</p>
        </div>
      </section>

      <section
        className="content-section examples-section"
        id="examples"
        aria-labelledby="examples-heading"
      >
        <p className="eyebrow">{t("examplesEyebrow")}</p>
        <div className="examples-heading">
          <h2 id="examples-heading">{t("examplesTitle")}</h2>
          <p>{t("examplesBody")}</p>
        </div>
        <div className="examples-grid">
          {POSTER_EXAMPLES.map((example, index) => (
            <figure
              className={`example-poster example-poster-${index + 1}`}
              key={example.style}
            >
              <Image
                className="example-poster-image"
                src={example.image}
                alt={styles(exampleCopy(example.style).alt)}
                width={1024}
                height={1280}
                sizes="(max-width: 520px) 100vw, (max-width: 800px) 50vw, 33vw"
              />
              <figcaption>
                <span className="eyebrow">{styles(example.style)}</span>
                <p>{styles(exampleCopy(example.style).prompt)}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section
        className="content-section"
        id="styles"
        aria-labelledby="styles-heading"
      >
        <p className="eyebrow">{t("stylesEyebrow")}</p>
        <h2 id="styles-heading">{t("stylesTitle")}</h2>
        <p className="section-intro">
          {STYLE_LANDINGS.map((landing, index) => (
            <span key={landing.slug}>
              {index > 0 ? " / " : ""}
              <Link href={`/${landing.slug}`}>{styles(landing.style)}</Link>
            </span>
          ))}
        </p>
      </section>

      <section
        className="content-section"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <p className="eyebrow">{t("howEyebrow")}</p>
        <h2 id="how-heading">{t("howTitle")}</h2>
        <ol className="content-grid how-to-grid">
          {localizedHowToSteps.map((step) => (
            <li key={step.label}>
              <article>
                <Image
                  className="how-step-image"
                  src={step.image}
                  alt={step.alt}
                  width={480}
                  height={300}
                  sizes="(max-width: 800px) 100vw, 25vw"
                />
                <span className="eyebrow">{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="pricing-section"
        id="pricing"
        aria-labelledby="pricing-heading"
      >
        <p className="eyebrow">{t("pricingEyebrow")}</p>
        <h2 id="pricing-heading">{t("pricingTitle")}</h2>
        <div className="pricing-card">
          <h3>{t("pricingCardTitle")}</h3>
          <p className="pricing-price">
            $9.90–$19.90 <small>{t("pricingMonth")}</small>
          </p>
          <ul>
            <li>{t("pricingFeature1")}</li>
            <li>{t("pricingFeature2")}</li>
            <li>{t("pricingFeature3")}</li>
            <li>{t("pricingFeature4")}</li>
            <li>{t("pricingFeature5")}</li>
            <li>{t("pricingFeature6")}</li>
          </ul>
          <Link className="pricing-link" href="/pricing">
            {t("seePlans")} <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>

      <section className="content-section" aria-labelledby="faq-heading">
        <p className="eyebrow">{t("faqEyebrow")}</p>
        <h2 id="faq-heading">{t("faqTitle")}</h2>
        <p className="section-intro">{t("faqIntro")}</p>
        <div className="faq-list">
          {localizedFaqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
