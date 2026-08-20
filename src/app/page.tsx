import { ArrowUpRight, MoveDown } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PosterStudio } from "@/components/poster-studio";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { STYLE_LANDINGS } from "@/lib/domain/style-landing";
import { getAuthContext } from "@/lib/server/auth";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const faqs = [
  [
    "Is this really free?",
    "Yes. Guests can make up to four generations per UTC day, with one watermarked 1K poster per run. Failed generations do not count, and no account is needed to try it.",
  ],
  [
    "What is an AI poster maker from text?",
    "It turns a written idea into finished visual directions. Describe the subject, mood, audience, or words you want to see, and the studio turns that brief into multiple compositions.",
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
    "A useful prompt usually names the subject, visual mood, audience, important copy, and practical format. For example, mention whether the poster is for a film night, product launch, class, or social post. Specific context helps the AI poster maker make stronger choices about hierarchy, color, and composition.",
  ],
] as const;

const howToSteps = [
  {
    label: "01 / BRIEF",
    title: "Start with a clear poster brief.",
    body: "Name the subject, audience, feeling, and any words that matter. A short brief gives the AI poster maker enough direction to build a useful first layout.",
    image: "/how-to/write-brief.svg",
    alt: "A poster brief with fields for subject, audience, mood, and headline.",
  },
  {
    label: "02 / STYLE",
    title: "Choose a poster style and format.",
    body: "Choose the art direction and format that fit the message, from minimal to neon. Match the ratio to its final home: feed, screen, print, or story.",
    image: "/how-to/choose-style.svg",
    alt: "Poster style cards and format controls arranged beside a creative brief.",
  },
  {
    label: "03 / GENERATE",
    title: "Generate multiple poster directions.",
    body: "Generate a range of compositions from the same brief. Compare the clearest subject, strongest hierarchy, and best balance of image and words.",
    image: "/how-to/generate-directions.svg",
    alt: "Multiple generated poster directions shown as a comparison grid.",
  },
  {
    label: "04 / KEEP",
    title: "Download, refine, and put it to work.",
    body: "Keep the direction that lands, refine the brief, and download. Free previews are watermarked; Pro adds private history and clean high-definition exports.",
    image: "/how-to/download-poster.svg",
    alt: "A finished poster being downloaded from the poster studio.",
  },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  // Supabase 的 site_url 错误兜底跳转到根路径（?error=...），转发到登录页显示原因
  const params = await searchParams;
  const authError = params.error_description ?? params.error;
  if (authError) {
    redirect(`/login?error=${encodeURIComponent(authError)}`);
  }
  const auth = await getAuthContext();
  const siteUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ?? "https://texttoposter.com";
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
        <Link href="#how-it-works">How it works</Link>
        <Link href="#pricing">Pricing</Link>
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
          Try the studio <ArrowUpRight size={15} />
        </Link>
      </SiteHeader>

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">From idea, text, or link to poster</p>
            <h1 id="hero-heading">
              AI Poster Maker — Generate Posters from Any Idea, Text, or Link
            </h1>
          </div>
          <div className="hero-copy">
            <p>
              Describe an idea, paste your content, or drop a link. AI turns it
              into a <strong>poster worth sharing</strong>.
            </p>
            <div className="hero-note">
              <span>01</span>
              <p>
                Free to try. No sign-up. Start with a sentence and see where it
                goes.
              </p>
            </div>
            <a className="pricing-link" href="#studio">
              Start with a brief <MoveDown size={15} />
            </a>
          </div>
        </div>
      </section>

      <PosterStudio isPro={auth.isPro} isGuest={!auth.userId} />

      <section
        className="content-section url-poster-section"
        id="url-poster"
        aria-labelledby="url-poster-heading"
      >
        <p className="eyebrow">Link to poster</p>
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
        <p className="eyebrow">What is an AI poster maker?</p>
        <div className="split-heading">
          <h2 id="what-is-heading">What Is an AI Poster Maker?</h2>
          <p>
            An AI poster maker turns a written brief into a visual starting
            point. Text to Poster is built for the moment before the design
            file: describe the subject, feeling, audience, or words that matter,
            and the studio turns one brief into multiple compositions you can
            compare, keep, and download. It is useful when you know what you
            want to say but do not want to spend an hour building the first
            layout from scratch.
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
          <h2 id="examples-heading">Multiple styles, one sentence away.</h2>
          <p>
            These are original sample directions made from short briefs. Pick a
            visual language, then give your own idea a shape in the studio.
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
        <p className="eyebrow">Browse by style</p>
        <h2 id="styles-heading">Poster styles</h2>
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
        className="content-section comparison-section"
        id="compare"
        aria-labelledby="compare-heading"
      >
        <p className="eyebrow">Choose your volume</p>
        <h2 id="compare-heading">Why Choose Our Free AI Poster Maker?</h2>
        <div className="comparison-grid">
          <article>
            <span className="eyebrow">Creator studio</span>
            <h3>Enough room to keep going.</h3>
            <p>
              100 weighted credits each monthly window, 1K/2K/4K, Medium/High
              finish, private history, and clean downloads. From $9.90/month.
            </p>
          </article>
          <article>
            <span className="eyebrow">Studio plan</span>
            <h3>More room for client rounds.</h3>
            <p>
              300 weighted credits each monthly window, higher-volume 4K
              exports, and the same private, watermark-free workflow. From
              $19.90/month.
            </p>
          </article>
        </div>
      </section>

      <section
        className="content-section"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <p className="eyebrow">A small studio, not a maze</p>
        <h2 id="how-heading">How to Make a Poster from Text</h2>
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
        className="content-section use-cases-section"
        aria-labelledby="use-cases-heading"
      >
        <p className="eyebrow">Made for the moment before design</p>
        <h2 id="use-cases-heading">
          Where a free AI poster maker earns its keep.
        </h2>
        <p className="section-intro">
          Use Text to Poster when you need a visual direction before a finished
          design file: describe the subject, audience, mood, and key words, then
          compare generated options. It works well for launches, screenings,
          workshops, social posts, and client rounds. Treat each result as a
          starting point—check names, dates, logos, claims, and usage rights
          before publishing, and finish the typography or accessibility review
          your channel requires.
        </p>
        <div className="comparison-grid use-cases-grid">
          <article>
            <span className="eyebrow">Launches and events</span>
            <h3>Make the announcement visible.</h3>
            <p>
              Start with the event name, date, audience, and one feeling you
              want people to remember. Generate several directions before you
              choose the visual language for a launch, screening, workshop, or
              community gathering.
            </p>
          </article>
          <article>
            <span className="eyebrow">Social and content</span>
            <h3>Give an idea a strong first frame.</h3>
            <p>
              Turn a post, video, newsletter, or campaign line into a poster
              concept that can guide the rest of the content. The side-by-side
              comparison makes it easier to find a cover image that feels
              specific instead of interchangeable.
            </p>
          </article>
          <article>
            <span className="eyebrow">Client and team rounds</span>
            <h3>Bring options to the conversation.</h3>
            <p>
              Use the first generation as a visual brief for a client or team.
              Compare mood, hierarchy, and format together, then refine the
              direction everyone can discuss. Pro history keeps the useful
              rounds private while the idea develops.
            </p>
          </article>
          <article>
            <span className="eyebrow">Personal projects</span>
            <h3>Make a rough idea tangible.</h3>
            <p>
              Turn a note, mood, or half-formed concept into a visual starting
              point. Use the result to think, share, or decide what the idea
              needs next.
            </p>
          </article>
        </div>
      </section>

      <section
        className="pricing-section"
        id="pricing"
        aria-labelledby="pricing-heading"
      >
        <p className="eyebrow">The serious version</p>
        <h2 id="pricing-heading">Room for the good idea.</h2>
        <div className="pricing-card">
          <h3>Creator + Studio</h3>
          <p className="pricing-price">
            $9.90–$19.90 <small>/ month</small>
          </p>
          <ul>
            <li>100 or 300 weighted credits each month</li>
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
        <h2 id="faq-heading">AI Poster Maker FAQs</h2>
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
