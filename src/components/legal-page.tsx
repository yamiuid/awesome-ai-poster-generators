import Link from "next/link";

type Kind = "privacy" | "terms" | "refunds";

const content: Readonly<
  Record<
    Kind,
    Readonly<{
      title: string;
      intro: string;
      sections: readonly [string, string][];
    }>
  >
> = {
  privacy: {
    title: "Privacy, without the fog.",
    intro:
      "Text to Poster is a small creative tool. This page explains the few services and identifiers needed to run it.",
    sections: [
      [
        "What we collect",
        "When you sign in, Supabase Auth gives us your email or Google identity and a user profile. We store your prompts, generation settings, task state, and private generated assets so the studio can finish and recover your work.",
      ],
      [
        "Anonymous limits",
        "Before sign-in, a random cookie is combined with a salted HMAC of that cookie, your IP, and User-Agent. We store only the derived guest key for the 24-hour limit, never the raw IP or User-Agent.",
      ],
      [
        "Service providers",
        "Supabase provides authentication, Postgres, and private Storage. APIMart receives the prompt and generation settings to create images. Waffo processes checkout and subscription events. Umami receives the listed product events without poster prompts.",
      ],
      [
        "Retention and deletion",
        "Guest images are kept for 24 hours. Free account images are kept for 7 days. Pro images remain while the subscription is active, then for 30 additional days. Expired assets are removed by a daily maintenance job. Contact support to request account deletion.",
      ],
      [
        "Contact",
        "For privacy questions, email support@texttoposter.com. We do not sell your prompts or images.",
      ],
    ],
  },
  terms: {
    title: "Terms for making things.",
    intro:
      "By using Text to Poster, you agree to use the studio lawfully and to keep material you submit within your rights to use.",
    sections: [
      [
        "The service",
        "Text to Poster turns text briefs into four image directions using a third-party image provider. Availability, generation time, and output details can vary.",
      ],
      [
        "Your material",
        "You keep responsibility for prompts, uploaded material, names, logos, and other rights-bearing content you include. Do not use the service to infringe rights, impersonate people, or create unlawful content.",
      ],
      [
        "Generated output",
        "Generated images are private to your account. Commercial use and ownership depend on the provider terms and any rights in your input; review those terms before publishing or selling an output.",
      ],
      [
        "Accounts and subscriptions",
        "Pro is available at the price shown at checkout. A subscription grants 100 weighted credits in each monthly window: credits do not roll over. Cancellation takes effect at the end of the current paid period.",
      ],
      [
        "Changes",
        "We may update these terms as the product changes. The current version is always posted here.",
      ],
    ],
  },
  refunds: {
    title: "A clear refund rule.",
    intro:
      "We review refund requests manually so the rule is easy to understand.",
    sections: [
      [
        "Eligibility",
        "A Pro purchase may qualify for a refund when the request arrives within 7 days of purchase and no credits from that purchase have been settled against a completed generation.",
      ],
      [
        "Not automatic",
        "Refunds are not issued automatically inside the app. Email support@texttoposter.com with your account email, Waffo order ID, and the reason for the request.",
      ],
      [
        "After cancellation",
        "Canceling a subscription preserves Pro access until the current period ends. Unused credits are not paid out and do not roll into a later period.",
      ],
    ],
  },
};

export function LegalPage({ kind }: Readonly<{ kind: Kind }>) {
  const page = content[kind];
  return (
    <main className="legal-page">
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </Link>
        <Link className="header-cta" href="/#studio">
          Open studio
        </Link>
      </header>
      <article className="legal-copy">
        <p className="eyebrow">Text to Poster / {kind}</p>
        <h1>{page.title}</h1>
        <p className="legal-intro">{page.intro}</p>
        {page.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
      </article>
      <footer className="site-footer">
        <span>© 2026 Text to Poster</span>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
        </nav>
      </footer>
    </main>
  );
}
