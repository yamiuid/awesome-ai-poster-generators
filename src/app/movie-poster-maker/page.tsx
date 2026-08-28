import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { PosterStudio } from "@/components/poster-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { getStyleLandingCopy } from "@/lib/domain/style-landing-copy";
import { toUiLocale } from "@/lib/i18n/locale";
import { pageMeta, siteUrl } from "@/lib/seo";
import { getAuthContext } from "@/lib/server/auth";

const movieFaqs = [
  [
    "Can I make a movie poster from a logline?",
    "Yes. Start with the film title or a working title, a one-sentence logline, the genre, and one memorable scene. The movie poster generator turns that brief into several film poster directions you can compare.",
  ],
  [
    "Is this movie poster generator free?",
    "Guests can make one watermarked 1K generation per UTC day. A free account gets four poster images per UTC day: four one-poster runs or two two-poster runs. Paid plans add more credits, resolutions, and private history.",
  ],
  [
    "Can I make a movie poster from a photo?",
    "The current studio starts with text or a public webpage URL. It does not upload a local photo directly; describe the photo, scene, or visual reference in the brief, or use a webpage URL when the source has a usable image.",
  ],
  [
    "Can I use the movie poster generator online without downloading software?",
    "Yes. Text to Poster is a browser-based movie poster maker. Open this page, write the brief, choose Movie in Art direction, and generate without installing a desktop editor.",
  ],
  [
    "Is this the best movie poster generator?",
    "The best movie poster generator depends on your workflow. Text to Poster is a strong fit when you want to compare several visual directions from one logline before choosing a composition, rather than accept the first result.",
  ],
  [
    "Can I include a film title and tagline?",
    "Yes. Include the title and tagline in your brief, then check every word in the result. AI image generation can misspell small text, names, dates, and logos.",
  ],
  [
    "What ratio should a movie poster use?",
    "Portrait works for a classic one-sheet, film-night flyer, or social post. Choose a wide ratio when the poster will appear on a screen or stage backdrop.",
  ],
  [
    "Can I use the generated movie poster commercially?",
    "Your generated assets are private to your account. Commercial use remains subject to the image provider terms and any rights attached to names, likenesses, logos, or other material in your prompt.",
  ],
] as const;

const movieDirections = [
  {
    label: "Cinematic noir",
    prompt:
      "Psychological noir thriller titled The Last Signal, set in a deserted coastal radio station at 2 a.m.; a rain-soaked woman in a black coat stands in the lower-left foreground while a red moon and a failing lighthouse occupy the distant upper-right, connected by a thin beam of light. Use a restrained black, rust-red, and bone palette, grainy 35mm texture, hard side lighting, deep negative space, and an asymmetrical one-sheet layout with tall condensed ivory title type stacked vertically along the right edge and a small festival-credit line at the bottom.",
    image: "/examples/movie-the-last-signal.webp",
    alt: "The Last Signal noir poster with a woman outside a radio station, red moon, and lighthouse.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Screen-printed drama",
    prompt:
      "A 1970s road movie called Dust Meridian, following an exhausted truck driver crossing an empty salt flat before sunrise. Build the poster as a two-color screen print: a tiny red pickup travels from the lower-right toward a huge pale sun on the horizon, with tire tracks forming a graphic diagonal through the frame. Use faded ochre, petrol blue, and warm cream ink, rough registration, halftone dots, and a wide horizontal composition; place the title in oversized block letters across the lower third like a vintage highway sign.",
    image: "/examples/movie-dust-meridian.webp",
    alt: "Dust Meridian screen-print road movie poster with a red truck crossing a salt flat at sunrise.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Typographic direction",
    prompt:
      "Science-fiction mystery poster for a film titled Europa Station, showing a lone astronaut suspended above the ice of Jupiter's moon while a fractured communications ring arcs around the composition. Use a strict Swiss editorial grid with a centered vertical axis, generous white space, midnight navy and ice-blue fields, one electric-orange warning accent, and crisp geometric linework. Let typography drive the image: a huge narrow title is split into three aligned bands, mission coordinates run along the margins, and the astronaut remains a small precise silhouette at the center.",
    image: "/examples/movie-europa-station.webp",
    alt: "Europa Station science-fiction poster with an astronaut, icy planet, and orbital communications ring.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Neon crime",
    prompt:
      "Neo-noir heist film titled Velvet Switch, set inside a 1980s hotel casino during a citywide blackout. Frame a gloved hand holding a stolen diamond in extreme foreground, with a masked getaway driver reflected in a broken elevator mirror behind it; use a Dutch angle and layered reflections to create tension. Light the scene with saturated cyan, magenta, and sodium amber, add wet glass and chrome highlights, and use a crowded collage layout with the title sliced diagonally through the image like a casino light strip.",
    image: "/examples/movie-velvet-switch.webp",
    alt: "Velvet Switch neon casino-heist poster with a diamond, masked driver, and roulette wheel.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Vintage romance",
    prompt:
      "Period romance poster for The Orchard Letters, set in 1936 rural Provence where two separated lovers exchange handwritten notes through an old orchard. Use a painterly gouache style with a couple seen from above on opposite sides of a long picnic blanket, connected by a winding path of white blossoms that creates a soft S-curve. Build a warm terracotta, faded teal, butter-yellow, and paper-cream palette, with sun-faded print texture, a generous top margin, and an elegant centered serif title framed by small botanical ornaments.",
    image: "/examples/movie-the-orchard-letters.webp",
    alt: "The Orchard Letters period-romance poster with two letter writers in a Provençal orchard.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Anime coming-of-age",
    prompt:
      "Animated coming-of-age adventure titled After the Monsoon, following three teenagers on bicycles racing across a flooded elevated train line toward a glowing city. Compose the poster from a low rear three-quarter view: the riders form a strong triangular silhouette in the foreground while a huge violet storm cloud opens into a turquoise sunset above them. Use hand-painted anime backgrounds, energetic speed lines, reflective puddles, saturated coral and electric blue accents, and a diagonal title lockup that follows the rails from lower-left to upper-right.",
    image: "/examples/movie-after-the-monsoon.webp",
    alt: "After the Monsoon animated poster with three cyclists riding toward a glowing city after a storm.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Minimal documentary",
    prompt:
      "Investigative documentary poster titled The Quiet Archive, about a retired archivist uncovering missing records from a closed textile factory. Use a restrained editorial composition: one small side-profile portrait sits in the lower-right corner, surrounded by an oversized cream field, faint blueprint lines, a redacted document fragment, and one cobalt-blue vertical rule. Keep the palette to warm white, graphite, dusty blue, and one muted red stamp; use monospaced labels, a compact left-aligned title block, generous negative space, and tactile recycled-paper grain.",
    image: "/examples/movie-the-quiet-archive.webp",
    alt: "The Quiet Archive documentary poster with a retired archivist, factory blueprint, and redacted records.",
    width: 1024,
    height: 1280,
  },
] as const;

export async function generateMetadata() {
  const locale = toUiLocale(await getLocale());
  const t = await getTranslations("styles");
  const style = t("movie");
  return pageMeta({
    title: t("metadataTitle", { style }),
    description: t("metadataDescription", { style }),
    path: "/movie-poster-maker",
    locale,
  });
}

export default async function MoviePosterMakerPage() {
  const auth = await getAuthContext();
  const locale = toUiLocale(await getLocale());
  const styles = await getTranslations("styles");
  const landing = getStyleLanding("movie-poster-maker");
  const style = styles(landing.style);
  const copy = getStyleLandingCopy(locale, style, landing);
  const faqContent = locale === "en" ? movieFaqs : copy.faqs;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqContent.map(([question, answer]) => ({
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
        name: copy.h1,
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: copy.h1,
        item: `${siteUrl}/movie-poster-maker`,
      },
    ],
  };

  if (locale !== "en") {
    return (
      <main className="legal-page movie-page">
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        <SiteHeader initialAuth={auth} />
        <article className="legal-copy movie-landing-copy">
          <nav className="breadcrumbs" aria-label={styles("moreHeading")}>
            <Link href="/">Text to Poster</Link>
            <span aria-hidden="true">/</span>
            <span>{style}</span>
          </nav>
          <section className="movie-hero" aria-labelledby="movie-heading">
            <p className="eyebrow">{styles("eyebrow", { style })}</p>
            <h1 id="movie-heading">{copy.h1}</h1>
            <p className="legal-intro">{copy.intro}</p>
            <a
              className="solid-button"
              href="#studio"
              data-umami-event="movie_cta_click"
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
              <h2 id="movie-studio-heading">
                {styles("promptHeading", { style })}
              </h2>
              <p>{copy.cta}</p>
            </div>
            <PosterStudio
              isPro={auth.isPro}
              isGuest={!auth.userId}
              initialStyle="movie"
            />
          </section>
          <section aria-labelledby="movie-prompt-heading">
            <h2 id="movie-prompt-heading">
              {styles("promptHeading", { style })}
            </h2>
            <p>{copy.promptLead}</p>
            <ul className="style-landing-list">
              {copy.promptTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="movie-faq-heading">
            <h2 id="movie-faq-heading">{styles("faqHeading", { style })}</h2>
            <div className="faq-list">
              {faqContent.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section aria-labelledby="movie-cta-heading">
            <h2 id="movie-cta-heading">{styles("tryHeading")}</h2>
            <p>{copy.cta}</p>
            <a
              className="solid-button"
              href="#studio"
              data-umami-event="movie_cta_click"
            >
              {styles("tryAction", { style })} <ArrowUpRight size={15} />
            </a>
          </section>
        </article>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="legal-page movie-page">
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <SiteHeader initialAuth={auth} />

      <article className="legal-copy movie-landing-copy">
        <nav className="breadcrumbs" aria-label={styles("moreHeading")}>
          <Link href="/">{copy.h1}</Link>
          <span aria-hidden="true">/</span>
          <span>{style}</span>
        </nav>

        <section className="movie-hero" aria-labelledby="movie-heading">
          <p className="eyebrow">{styles("eyebrow", { style })}</p>
          <h1 id="movie-heading">{copy.h1}</h1>
          <p className="legal-intro">{copy.intro}</p>
          <a
            className="solid-button"
            href="#studio"
            data-umami-event="movie_cta_click"
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
            <h2 id="movie-studio-heading">
              {styles("promptHeading", { style })}
            </h2>
            <p>{copy.cta}</p>
          </div>
          <PosterStudio
            isPro={auth.isPro}
            isGuest={!auth.userId}
            initialStyle="movie"
            examples={movieDirections}
          />
        </section>

        <section id="directions" aria-labelledby="directions-heading">
          <p className="eyebrow">Different genres / different directions</p>
          <h2 id="directions-heading">
            Compare the film before you design it.
          </h2>
          <p>
            Compare noir, neon crime, vintage romance, anime coming-of-age, and
            minimal documentary treatments side by side. A movie poster
            generator is most useful when it gives you options to discuss, not
            just one image to accept.
          </p>
          <div className="examples-grid movie-direction-grid">
            {movieDirections.map((direction, index) => (
              <figure
                className={`example-poster example-poster-${index + 1}`}
                key={direction.label}
              >
                <Image
                  className="example-poster-image"
                  src={direction.image}
                  alt={direction.alt}
                  width={direction.width}
                  height={direction.height}
                  priority={index === 0}
                  sizes="(max-width: 520px) 100vw, (max-width: 800px) 50vw, 33vw"
                />
                <figcaption>
                  <span className="eyebrow">{direction.label}</span>
                  <p>{direction.prompt}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section aria-labelledby="what-is-movie-heading">
          <p className="eyebrow">A visual starting point</p>
          <h2 id="what-is-movie-heading">What Is a Movie Poster Generator?</h2>
          <p>
            A movie poster generator turns a written film brief into a visual
            starting point: a title, a logline, a scene, a genre, and a mood
            become choices about image, typography, color, and composition. It
            is useful before a final key art brief exists, when a director,
            producer, or film club needs to see the story take shape quickly.
          </p>
          <p>
            Text to Poster is a movie poster generator from text and a film
            poster generator for early creative exploration. The AI movie poster
            generator helps create artwork, layout, and type treatments, while
            you decide which direction feels most like the film. A movie poster
            maker should support that conversation, not hide it behind one
            uneditable result.
          </p>
        </section>

        <section aria-labelledby="movie-how-heading">
          <p className="eyebrow">From logline to film poster</p>
          <h2 id="movie-how-heading">
            How to Generate a Movie Poster from Text
          </h2>
          <ol className="style-landing-list">
            <li>
              Write the title, logline, genre, and one scene people should
              remember.
            </li>
            <li>
              Choose a format for a one-sheet, screening flyer, social post, or
              screen.
            </li>
            <li>
              Generate several movie poster directions from the same brief.
            </li>
            <li>
              Keep the clearest composition, then refine the copy and download
              it.
            </li>
          </ol>
        </section>

        <section aria-labelledby="prompt-heading">
          <p className="eyebrow">Prompt formula</p>
          <h2 id="prompt-heading">Give the film poster enough to work with.</h2>
          <p>
            A strong film poster generator prompt names the story, genre, visual
            era, key scene, emotional tone, and words that must appear. Keep the
            brief specific enough to guide the composition, but short enough to
            compare across several directions. If the film is still changing,
            leave room for the generator to suggest a visual angle you had not
            considered.
          </p>
          <pre className="movie-prompt-example">
            <code>
              {
                "Title: Midnight Signal\nGenre: independent noir drama\nScene: a lone figure under a red moon on an empty road\nMood: quiet dread, art-house tension\nPoster format: portrait one-sheet\nCopy: MIDNIGHT SIGNAL / An independent film"
              }
            </code>
          </pre>
        </section>

        <section aria-labelledby="free-movie-heading">
          <p className="eyebrow">Try the first direction free</p>
          <h2 id="free-movie-heading">
            Movie Poster Generator Free: Start Without a Subscription
          </h2>
          <p>
            You can test the movie poster generator free before deciding whether
            it belongs in your production workflow. Guests get one watermarked
            1K generation per UTC day with no sign-up required. A free account
            raises that to four poster images per UTC day, while paid plans add
            monthly credits, higher resolutions, more posters per run, and
            private history.
          </p>
          <p>
            The free limits are visible in the studio before you generate, so
            you can plan a quick moodboard or a screening announcement without
            mistaking a trial for unlimited commercial production capacity.
          </p>
          <p>
            For a first pass, keep the brief focused on the story and the
            feeling rather than listing every camera detail. Once one direction
            has the right shape, add the exact title, date, credit line, or
            visual reference you need to refine the next round.
          </p>
        </section>

        <section aria-labelledby="photo-heading">
          <p className="eyebrow">Photo reference, honestly explained</p>
          <h2 id="photo-heading">
            Movie Poster Generator from Photo: What Is Supported?
          </h2>
          <p>
            This page currently generates from a written brief or a public
            webpage URL. It does not upload a local photo directly or replace a
            full photo editor. If a public article or project page has a usable
            preview image, the URL workflow can bring that image into the brief
            as a reference while the text describes the film and the intended
            treatment.
          </p>
          <p>
            For a private still, describe the subject, lighting, costume, and
            camera feeling in the prompt instead. That keeps the first creative
            direction fast and makes it clear which parts of the poster come
            from your source material and which parts are generated.
          </p>
        </section>

        <section aria-labelledby="online-heading">
          <p className="eyebrow">Browser-based workflow</p>
          <h2 id="online-heading">
            Movie Poster Generator Online, Without a Download
          </h2>
          <p>
            The studio runs online in your browser. You can open this page from
            a laptop, tablet, or phone, write a brief, choose the Movie art
            direction, and review the output in the same workspace. There is no
            desktop install, template library, or separate hand-off between the
            prompt and the first poster direction.
          </p>
          <p>
            That makes the online workflow useful for a quick pitch review: a
            writer can bring the logline, a director can react to the mood, and
            a producer can save the direction that deserves a fuller key art
            brief. The generator is an exploration step, not a claim that every
            final credit or logo will be typeset perfectly by the model.
          </p>
        </section>

        <section aria-labelledby="movie-use-cases-heading">
          <p className="eyebrow">Built for the first visual decision</p>
          <h2 id="movie-use-cases-heading">
            From thriller concept to screening night.
          </h2>
          <div className="comparison-grid movie-use-case-grid">
            <article>
              <span className="eyebrow">Thriller and noir</span>
              <h3>Build tension in one frame.</h3>
              <p>
                Use a scene, shadow, and restricted palette to test the film’s
                emotional temperature.
              </p>
            </article>
            <article>
              <span className="eyebrow">Sci-fi and fantasy</span>
              <h3>Find the world before the campaign.</h3>
              <p>
                Compare the scale, setting, and focal point that make the story
                feel specific.
              </p>
            </article>
            <article>
              <span className="eyebrow">Romance and indie</span>
              <h3>Make the relationship visible.</h3>
              <p>
                Describe the feeling and one memorable detail, then compare
                intimate and editorial directions.
              </p>
            </article>
            <article>
              <span className="eyebrow">Screenings and festivals</span>
              <h3>Give the date a visual language.</h3>
              <p>
                Start with the screening, venue, audience, and title so the
                poster can work as an announcement.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="best-heading">
          <p className="eyebrow">Choose the workflow, not the buzzword</p>
          <h2 id="best-heading">
            How to Choose the Best Movie Poster Generator
          </h2>
          <p>
            “Best” depends on what has to happen after the first image. For a
            film concept, look for a tool that accepts a logline, keeps the
            title and mood visible, lets you compare more than one direction,
            and makes the output easy to refine. Check the free quota, image
            rights, export resolution, and whether the tool works online before
            you commit a whole campaign to it.
          </p>
          <p>
            Text to Poster is built around that comparison loop: one brief,
            multiple poster directions, then a choice about what to keep. It is
            a practical fit for independent films, student screenings, pitch
            decks, festivals, and early campaign exploration where the visual
            idea is still being discussed.
          </p>
        </section>

        <section aria-labelledby="multiple-heading">
          <p className="eyebrow">The difference</p>
          <h2 id="multiple-heading">
            One Logline, Multiple Creative Directions
          </h2>
          <p>
            Most poster tools take you from a prompt to one result. Text to
            Poster keeps the exploration visible: generate a range of film
            poster compositions, compare the strongest subject and hierarchy,
            then refine the direction that feels like the film. You can move
            from a rough logline to a useful visual conversation before paying
            for a final shoot or commissioning finished key art.
          </p>
        </section>

        <section aria-labelledby="movie-faq-heading">
          <p className="eyebrow">Questions, answered</p>
          <h2 id="movie-faq-heading">{styles("faqHeading", { style })}</h2>
          <div className="faq-list">
            {faqContent.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="movie-cta-heading">
          <p className="eyebrow">Ready for a first direction?</p>
          <h2 id="movie-cta-heading">{styles("tryHeading")}</h2>
          <p>{copy.cta}</p>
          <a
            className="solid-button"
            href="#studio"
            data-umami-event="movie_cta_click"
          >
            {styles("tryAction", { style })} <ArrowUpRight size={15} />
          </a>
        </section>

        <section aria-labelledby="related-heading">
          <p className="eyebrow">Keep exploring</p>
          <h2 id="related-heading">{styles("moreHeading")}</h2>
          <p className="style-links">
            <Link href="/">AI poster generator</Link> /{" "}
            <Link href="/minimal-poster-generator">
              Minimal poster generator
            </Link>{" "}
            /{" "}
            <Link href="/business-poster-generator">
              Business poster generator
            </Link>{" "}
            / <Link href="/neon-poster-generator">Neon poster generator</Link>
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
