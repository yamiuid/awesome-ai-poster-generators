import { ArrowUpRight, MoveDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PosterStudio } from "@/components/poster-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { isPosterStyle } from "@/lib/domain/poster";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { STYLE_LANDINGS } from "@/lib/domain/style-landing";
import { pageMeta, siteUrl } from "@/lib/seo";
import { getAuthContext } from "@/lib/server/auth";

export const metadata = pageMeta({
  title: "Free AI Poster Generator from Text | Text to Poster",
  description:
    "Create posters from text with AI. Describe a brief, generate multiple artwork and layout directions, and download your favorite. Free to try, no login.",
  path: "/",
});

const faqs = [
  [
    "Is this really free?",
    "Yes. Guests can make one generation per UTC day, with one watermarked 1K poster per run. Free accounts can create four poster images per UTC day: four one-poster runs or two two-poster runs. Failed generations do not count.",
  ],
  [
    "What is an AI poster generator from text?",
    "It turns a written brief into finished visual directions. Describe the subject, mood, audience, or words you want to see, and the studio turns that brief into multiple compositions.",
  ],
  [
    "Which poster styles are available?",
    "Movie, Minimal, Anime, Business, Vintage, and Neon. Pick a direction, then let the same brief branch into multiple distinct readings.",
  ],
  [
    "Can I use the posters commercially?",
    "Your generated assets are private to your account. Commercial use remains subject to the image provider terms and any rights attached to material you include in your prompt.",
  ],
  [
    "How long are my images kept?",
    "Guest images stay available for 24 hours, free account images for 7 days, and Pro images while your subscription is active plus a 30-day grace period after cancellation.",
  ],
  [
    "Can I make a poster from a short text prompt?",
    "Yes. Start with one clear sentence and add only the details that change the result: the subject, mood, audience, format, or words that must appear. You can begin with a rough idea, compare the generated directions, and refine the prompt after you see what the first round suggests.",
  ],
  [
    "What should I include in an AI poster prompt?",
    "A useful prompt usually names the subject, visual mood, audience, important copy, and practical format. For example, mention whether the poster is for a film night, product launch, class, or social post. Specific context helps the AI poster generator make stronger choices about hierarchy, color, and composition.",
  ],
] as const;

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
  const authError = params.error_description ?? params.error;
  if (authError) {
    redirect(`/login?error=${encodeURIComponent(authError)}`);
  }
  const initialStyle =
    params.style && isPosterStyle(params.style) ? params.style : undefined;
  const auth = await getAuthContext();
  const applicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Text to Poster",
    url: siteUrl,
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
    mainEntity: faqs.map(([question, answer]) => ({
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
      <SiteHeader>
        <Link href="#examples">Examples</Link>
        <Link href="#use-cases">Use cases</Link>
        <Link href="#how-it-works">How it works</Link>
        <Link href="/pricing">Pricing</Link>
        {auth.userId ? (
          <UserMenu
            email={auth.email}
            avatarUrl={auth.avatarUrl}
            tier={auth.tier}
          />
        ) : (
          <Link href="/login">Sign in</Link>
        )}
        <Link className="header-cta" href="#studio">
          Generate a poster <ArrowUpRight size={15} />
        </Link>
      </SiteHeader>

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Free AI poster generator from text</p>
            <h1 id="hero-heading">
              AI Poster Generator — Create Posters from Text
            </h1>
          </div>
          <div className="hero-copy">
            <p>
              Describe your poster. AI creates the artwork, layout, and
              typography in seconds, then gives you{" "}
              <strong>multiple directions to compare</strong>.
            </p>
            <div className="hero-note">
              <span>01</span>
              <p>
                Free to try, no sign-up required. Start with a sentence and
                refine the direction that lands.
              </p>
            </div>
            <div className="hero-actions">
              <a
                className="solid-button"
                href="#studio"
                data-umami-event="hero_generate_click"
              >
                Generate a poster <MoveDown size={15} />
              </a>
              <a className="pricing-link" href="#examples">
                See examples <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="hero-types">
              Movie / Event / Product / Business / Concert / Social
            </p>
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
        <p className="eyebrow">Popular poster use cases</p>
        <h2 id="use-cases-heading">
          Create Posters for Movies, Events, Products, and More
        </h2>
        <p className="section-intro">
          Start with the job the poster needs to do, then compare several visual
          directions from the same brief. Use Text to Poster for movie
          screenings, event announcements, product launches, business updates,
          concert nights, and social content.
        </p>
        <div className="comparison-grid use-cases-grid">
          <Link className="use-case-card" href="/movie-poster-maker">
            <article>
              <span className="eyebrow">Movie posters</span>
              <h3>Turn a logline into a film poster.</h3>
              <p>
                Set the genre, scene, and mood before you commit to a final
                composition.
              </p>
              <span className="solid-button use-case-action">
                Create a movie poster <ArrowUpRight size={15} />
              </span>
            </article>
          </Link>
          <article>
            <span className="eyebrow">Events and concerts</span>
            <h3>Make the date and feeling impossible to miss.</h3>
            <p>
              Name the event, audience, venue, and one idea people should
              remember.
            </p>
          </article>
          <Link className="use-case-card" href="/business-poster-generator">
            <article>
              <span className="eyebrow">Products and business</span>
              <h3>Give a launch or update a clear visual direction.</h3>
              <p>
                Describe the offer, audience, tone, and copy that must appear.
              </p>
              <span className="solid-button use-case-action">
                Create a business poster <ArrowUpRight size={15} />
              </span>
            </article>
          </Link>
          <article>
            <span className="eyebrow">Social content</span>
            <h3>Give a post, video, or campaign a strong first frame.</h3>
            <p>
              Compare cover directions before the rest of the content takes
              shape.
            </p>
          </article>
        </div>
      </section>

      <section
        className="content-section url-poster-section"
        id="url-poster"
        aria-labelledby="url-poster-heading"
      >
        <p className="eyebrow">A second input mode</p>
        <div className="split-heading">
          <h2 id="url-poster-heading">Turn a link into a poster.</h2>
          <p>
            Paste an article, event page, or announcement URL. Text to Poster
            reads the page, pulls out the title, the key message, and the points
            that matter, then turns them into a poster brief you can edit before
            generating.
          </p>
        </div>
        <ol className="content-grid url-poster-steps">
          <li>
            <article>
              <span className="eyebrow">01 / PASTE</span>
              <h3>Drop in a link.</h3>
              <p>
                Paste an article, event page, or announcement URL into the
                studio.
              </p>
            </article>
          </li>
          <li>
            <article>
              <span className="eyebrow">02 / READ</span>
              <h3>AI extracts the brief.</h3>
              <p>
                Text to Poster reads the page and pulls out the title, the key
                message, and the points that matter.
              </p>
            </article>
          </li>
          <li>
            <article>
              <span className="eyebrow">03 / EDIT &amp; GENERATE</span>
              <h3>Shape it, then generate.</h3>
              <p>
                Review and edit the brief before turning the link into poster
                directions you can compare and download.
              </p>
            </article>
          </li>
        </ol>
        <p className="url-poster-cta">
          <a className="pricing-link" href="#studio">
            Try it in the studio <ArrowUpRight size={15} />
          </a>
        </p>
      </section>

      <section
        className="content-section what-is-section"
        id="what-is"
        aria-labelledby="what-is-heading"
      >
        <p className="eyebrow">What is an AI poster generator from text?</p>
        <div className="split-heading">
          <h2 id="what-is-heading">
            What Is an AI Poster Generator from Text?
          </h2>
          <p>
            An AI poster generator from text turns a written brief into a
            complete visual starting point. Describe the subject, feeling,
            audience, or words that matter, and Text to Poster creates multiple
            artwork, layout, and typography directions you can compare, keep,
            and download. It is useful when you know what you want to say but do
            not want to build the first layout from scratch.
          </p>
        </div>
      </section>

      <section
        className="content-section examples-section"
        id="examples"
        aria-labelledby="examples-heading"
      >
        <p className="eyebrow">Example outputs</p>
        <div className="examples-heading">
          <h2 id="examples-heading">One Brief, Multiple Poster Directions</h2>
          <p>
            These are original sample directions made from short briefs. Compare
            the mood, hierarchy, and image treatment before you choose the
            direction to refine in the studio.
          </p>
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
                alt={example.alt}
                width={1024}
                height={1280}
                sizes="(max-width: 520px) 100vw, (max-width: 800px) 50vw, 33vw"
              />
              <figcaption>
                <span className="eyebrow">{example.label}</span>
                <p>{example.prompt}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="content-section" aria-labelledby="styles-heading">
        <p className="eyebrow">Product visual directions</p>
        <h2 id="styles-heading">Choose a Visual Style</h2>
        <p className="section-intro">
          {STYLE_LANDINGS.map((landing, index) => (
            <span key={landing.slug}>
              {index > 0 ? " / " : ""}
              <Link href={`/${landing.slug}`}>{landing.linkLabel}</Link>
            </span>
          ))}
        </p>
      </section>

      <section
        className="content-section"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <p className="eyebrow">A small studio, not a maze</p>
        <h2 id="how-heading">How to Generate a Poster from Text</h2>
        <ol className="content-grid how-to-grid">
          {howToSteps.map((step) => (
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
        <p className="eyebrow">Free to try, room to keep going</p>
        <h2 id="pricing-heading">Choose your generation volume.</h2>
        <div className="pricing-card">
          <h3>Creator + Studio</h3>
          <p className="pricing-price">
            $9.90–$19.90 <small>/ month</small>
          </p>
          <ul>
            <li>Guests get one watermarked generation per UTC day</li>
            <li>Free accounts get four poster images per UTC day</li>
            <li>Creator and Studio plans add monthly credits</li>
            <li>1K, 2K, and 4K exports</li>
            <li>Medium and High finishes</li>
            <li>Private history with no watermark</li>
          </ul>
          <Link className="pricing-link" href="/pricing">
            See plans <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>

      <section className="content-section" aria-labelledby="faq-heading">
        <p className="eyebrow">Questions, answered</p>
        <h2 id="faq-heading">AI Poster Generator FAQs</h2>
        <p className="section-intro">
          Start small, learn from the first result, and refine only what needs
          changing. These answers cover the practical details behind making a
          poster from text with the free studio.
        </p>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
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
