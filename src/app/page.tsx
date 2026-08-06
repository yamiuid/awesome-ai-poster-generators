import { ArrowUpRight, MoveDown } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PosterStudio } from "@/components/poster-studio";
import { UserMenu } from "@/components/user-menu";
import { getAuthContext } from "@/lib/server/auth";

const faqs = [
  [
    "Is this really free?",
    "Yes. Guests can generate up to four posters every 24 hours (up to two per run), with a small watermark and a 1K preview. No account is needed to try it.",
  ],
  [
    "What is an AI poster maker from text?",
    "It turns a written idea into finished visual directions. Describe the subject, mood, audience, or words you want to see, and the studio turns that brief into four compositions.",
  ],
  [
    "Which poster styles are available?",
    "Movie, Minimal, Anime, Business, Vintage, and Neon. Pick a direction, then let the same brief branch into four distinct readings.",
  ],
  [
    "Can I use the posters commercially?",
    "Your generated assets are private to your account. Commercial use remains subject to the image provider terms and any rights attached to material you include in your prompt.",
  ],
  [
    "How long are my images kept?",
    "Guest images stay available for 24 hours, free account images for 7 days, and Pro images while your subscription is active plus a 30-day grace period after cancellation.",
  ],
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
  const applicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Text to Poster",
    url: "https://texttoposter.com",
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
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </Link>
        <nav className="header-nav" aria-label="Primary navigation">
          <Link href="#how-it-works">How it works</Link>
          <Link href="#pricing">Pricing</Link>
          {auth.userId ? (
            <UserMenu email={auth.email} avatarUrl={auth.avatarUrl} />
          ) : (
            <Link href="/login">Sign in</Link>
          )}
          <Link className="header-cta" href="#studio">
            Try the studio <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">AI poster maker / from text</p>
            <h1 id="hero-heading">
              AI Poster Maker — Generate Posters from Text in Seconds
            </h1>
          </div>
          <div className="hero-copy">
            <p>
              Turn a thought, a launch, or a feeling into{" "}
              <strong>four finished poster directions</strong> in seconds. Made
              for people who need the image before they need the software.
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

      <PosterStudio isPro={auth.isPro} />

      <section
        className="content-section what-is-section"
        id="what-is"
        aria-labelledby="what-is-heading"
      >
        <p className="eyebrow">What is an AI poster maker?</p>
        <div className="split-heading">
          <h2 id="what-is-heading">
            A sentence in. Four visual directions out.
          </h2>
          <p>
            Text to Poster is a focused AI poster maker for the moment before
            the design file. Describe the subject, feeling, audience, or words
            that matter; the studio turns one brief into four compositions you
            can compare, keep, and download.
          </p>
        </div>
      </section>

      <section
        className="content-section comparison-section"
        id="compare"
        aria-labelledby="compare-heading"
      >
        <p className="eyebrow">Choose your volume</p>
        <h2 id="compare-heading">Preview freely. Keep seriously.</h2>
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
        <h2 id="how-heading">Less software. More signal.</h2>
        <div className="content-grid">
          <article>
            <span className="eyebrow">01 / Describe</span>
            <h3>Start with the feeling.</h3>
            <p>
              Give the studio a subject, a mood, a line of copy, or all three.
              Specific words create more useful directions.
            </p>
          </article>
          <article>
            <span className="eyebrow">02 / Generate</span>
            <h3>Four readings at once.</h3>
            <p>
              Choose an art direction and format. The same brief branches into
              four compositions so you can compare instead of guessing.
            </p>
          </article>
          <article>
            <span className="eyebrow">03 / Download</span>
            <h3>Take the one that lands.</h3>
            <p>
              Download a watermarked preview for free, or keep private history
              and export clean high-definition posters with Pro.
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
        <h2 id="faq-heading">The fine print, plainly.</h2>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>© 2026 Text to Poster</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/ai-policy">AI use</Link>
          <Link href="mailto:support@texttoposter.com">Support</Link>
        </nav>
      </footer>
    </main>
  );
}
