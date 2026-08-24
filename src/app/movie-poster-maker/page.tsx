import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMeta, siteUrl } from "@/lib/seo";

const movieFaqs = [
  [
    "Can I make a movie poster from a logline?",
    "Yes. Start with the film title or a working title, a one-sentence logline, the genre, and one memorable scene. The generator turns that brief into several film poster directions you can compare.",
  ],
  [
    "Is the AI movie poster generator free?",
    "Guests can make one watermarked 1K generation per UTC day. A free account gets four generations each day, and paid plans add more credits, resolutions, and private history.",
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
      "Independent film premiere, a lone figure under a red moon, art-house tension.",
    image: "/examples/movie-midnight-signal.webp",
    alt: "An independent film poster with a lone figure beneath a red moon.",
    width: 1024,
    height: 1280,
  },
  {
    label: "Screen-printed drama",
    prompt:
      "The same brief, reduced to a lone road, a red moon, and quiet dread.",
    image: "/examples/movie-midnight-signal-noir.webp",
    alt: "A screen-printed noir film poster with a lone figure, red moon, and dark road.",
    width: 1122,
    height: 1402,
  },
  {
    label: "Typographic direction",
    prompt:
      "The same brief, expressed through a bold title, orbit line, and one distant figure.",
    image: "/examples/movie-midnight-signal-typography.webp",
    alt: "A typographic film poster with a large Midnight Signal title, red orbit line, and distant figure.",
    width: 1003,
    height: 1568,
  },
] as const;

export const metadata = pageMeta({
  title: "Free AI Movie Poster Generator from Text | Text to Poster",
  description:
    "Turn a title, logline, or scene into cinematic movie poster directions. Generate multiple film poster layouts from text and compare them free.",
  path: "/movie-poster-maker",
});

export default function MoviePosterMakerPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: movieFaqs.map(([question, answer]) => ({
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
        name: "AI Poster Generator",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "AI Movie Poster Generator",
        item: `${siteUrl}/movie-poster-maker`,
      },
    ],
  };

  return (
    <main className="legal-page movie-page">
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <SiteHeader>
        <Link href="/#examples">Examples</Link>
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/">AI poster generator</Link>
        <Link
          className="header-cta"
          href="/?style=movie#studio"
          data-umami-event="movie_cta_click"
        >
          Create a movie poster <ArrowUpRight size={15} />
        </Link>
      </SiteHeader>

      <article className="legal-copy movie-landing-copy">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">AI Poster Generator</Link>
          <span aria-hidden="true">/</span>
          <span>Movie Poster Generator</span>
        </nav>

        <section className="movie-hero" aria-labelledby="movie-heading">
          <p className="eyebrow">AI poster generator / Movie</p>
          <h1 id="movie-heading">AI Movie Poster Generator</h1>
          <p className="legal-intro">
            Turn a film title, logline, or key scene into multiple cinematic
            poster directions. Compare the mood, hierarchy, and visual language
            before you commit to a finished movie poster.
          </p>
          <Link
            className="solid-button"
            href="/?style=movie#studio"
            data-umami-event="movie_cta_click"
          >
            Create a movie poster <ArrowUpRight size={15} />
          </Link>
        </section>

        <section aria-labelledby="directions-heading">
          <p className="eyebrow">One logline / three directions</p>
          <h2 id="directions-heading">
            Compare the film before you design it.
          </h2>
          <p>
            These original directions start from the same brief: “Independent
            film premiere, a lone figure under a red moon, art-house tension.” A
            movie poster generator is most useful when it gives you options to
            discuss, not just one image to accept.
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
            compare across several directions.
          </p>
          <pre className="movie-prompt-example">
            <code>
              {
                "Title: Midnight Signal\nGenre: independent noir drama\nScene: a lone figure under a red moon on an empty road\nMood: quiet dread, art-house tension\nPoster format: portrait one-sheet\nCopy: MIDNIGHT SIGNAL / An independent film"
              }
            </code>
          </pre>
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

        <section aria-labelledby="multiple-heading">
          <p className="eyebrow">The difference</p>
          <h2 id="multiple-heading">
            One Logline, Multiple Creative Directions
          </h2>
          <p>
            Most poster tools take you from a prompt to one result. Text to
            Poster keeps the exploration visible: generate a range of film
            poster compositions, compare the strongest subject and hierarchy,
            then refine the direction that feels like the film.
          </p>
        </section>

        <section aria-labelledby="movie-faq-heading">
          <p className="eyebrow">Questions, answered</p>
          <h2 id="movie-faq-heading">Movie Poster Generator FAQs</h2>
          <div className="faq-list">
            {movieFaqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="movie-cta-heading">
          <p className="eyebrow">Ready for a first direction?</p>
          <h2 id="movie-cta-heading">Turn the logline into a movie poster.</h2>
          <p>
            Start with a title, a scene, or a rough idea. The studio will open
            with Movie already selected so you can compare the first directions
            without rebuilding the brief.
          </p>
          <Link
            className="solid-button"
            href="/?style=movie#studio"
            data-umami-event="movie_cta_click"
          >
            Start a movie poster brief <ArrowUpRight size={15} />
          </Link>
        </section>

        <section aria-labelledby="related-heading">
          <p className="eyebrow">Keep exploring</p>
          <h2 id="related-heading">More poster directions</h2>
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
