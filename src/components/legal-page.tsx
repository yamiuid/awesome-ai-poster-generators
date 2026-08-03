import Link from "next/link";

type Kind = "privacy" | "terms" | "refunds" | "ai-policy";

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
        "When you sign in, Supabase Auth gives us your email or Google identity and a user profile. We store your prompts, generation settings, task state, and private generated assets so the studio can finish and recover your work. We also receive limited technical logs, cookie identifiers, subscription state, Waffo order identifiers, and analytics events.",
      ],
      [
        "Anonymous limits",
        "Before sign-in, a random cookie is combined with a salted HMAC of that cookie, your IP, and User-Agent. We store only the derived guest key for the 24-hour limit, never the raw IP or User-Agent.",
      ],
      [
        "Service providers",
        "Supabase provides authentication, Postgres, and private Storage. APIMart receives the prompt and generation settings to create images. Waffo processes checkout, payment, and subscription events; it may process payment details as the merchant-of-record provider. Vercel hosts the app, and Umami receives the listed product events without poster prompts. These providers may process data in countries other than where you live.",
      ],
      [
        "Why we use it",
        "We use this information to provide the service, authenticate accounts, enforce free-use limits, process subscriptions, secure the service, respond to support requests, meet legal obligations, and understand product usage. We do not sell prompts or generated images and do not use them for advertising profiles.",
      ],
      [
        "Retention and deletion",
        "Guest images are kept for 24 hours. Free account images are kept for 7 days. Pro images remain while the subscription is active, then for 30 additional days. Payment and accounting records may be kept longer where required by law. Expired assets are removed by a daily maintenance job. Contact support to request account deletion.",
      ],
      [
        "Your choices",
        "You may request access, correction, deletion, or a copy of personal information by emailing support@texttoposter.com. You may stop analytics where the available browser controls or consent settings allow it. We may need to verify a request and retain limited information when a legal or security obligation requires it.",
      ],
      [
        "Children and sensitive data",
        "The service is not directed to children under 13, or the higher minimum age required where you live. Do not submit government identifiers, payment card numbers, health data, precise location, or other sensitive personal information in a prompt. If you believe a child’s information was submitted, contact support.",
      ],
      [
        "Contact",
        "For privacy questions, data requests, or complaints, email support@texttoposter.com. We may ask for information needed to verify a request and will respond within the period required by applicable law.",
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
        "Text to Poster turns text briefs into four AI-generated image directions using a third-party image provider. Availability, generation time, safety filtering, and output details can vary. You must be at least 13 years old or meet the higher minimum age required where you live.",
      ],
      [
        "Your material",
        "You keep responsibility for prompts, uploaded material, names, logos, likenesses, and other rights-bearing content you include. You give us the limited permission needed to transmit and process that material to provide the service. Do not submit personal or confidential information unless you have a lawful basis and consent to do so.",
      ],
      [
        "Generated output",
        "Generated images are private to your account. Output may be inaccurate, similar to other output, unsuitable for a particular purpose, or unavailable for exclusive copyright protection. Commercial use and ownership depend on applicable provider terms and any rights in your input; review the result and those terms before publishing or selling it.",
      ],
      [
        "AI disclosure and review",
        "The service clearly identifies output as AI-generated in the product experience. You are responsible for human review, fact checking, rights clearance, and any AI disclosure, labeling, provenance, or notice required by law, platform rules, or the context where you publish an output. Do not present an output as an authentic photograph or human-made work when that would mislead people.",
      ],
      [
        "Acceptable use and enforcement",
        "Do not use Text to Poster for illegal content, sexual content involving minors, non-consensual intimate imagery, impersonation or deceptive deepfakes, harassment, hate, threats, fraud, infringement, or instructions for serious wrongdoing. We may refuse a prompt, remove an asset, suspend an account, or preserve information for safety or legal reasons. See the AI use policy for reporting and additional examples.",
      ],
      [
        "Accounts and subscriptions",
        "Pro is available at the price shown at checkout. Waffo processes payment and subscription events. A subscription grants 100 weighted credits in each monthly window: credits do not roll over. Cancellation takes effect at the end of the current paid period. Refund eligibility is described in the Refunds policy and does not limit mandatory consumer rights.",
      ],
      [
        "No professional advice",
        "The service is a creative tool, not a source of legal, medical, financial, safety, identity, or factual advice. Do not rely on an output for a high-impact decision or as evidence of a real person, place, event, or claim without independent verification.",
      ],
      [
        "Reports and intellectual property complaints",
        "Report suspected unlawful, harmful, privacy-invading, or infringing output to support@texttoposter.com with the generation or account details needed to locate it. We may request proof of authority and may remove or restrict access while we review a report.",
      ],
      [
        "Changes",
        "We may update these terms as the product changes. The current version is always posted here. Additional statutory consumer notices may apply based on where you live.",
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
        "A Pro purchase may qualify for a refund when the request arrives within 7 days of purchase and no credits from that purchase have been settled against a completed generation. This policy does not remove mandatory consumer cancellation or refund rights that apply in your jurisdiction.",
      ],
      [
        "Not automatic",
        "Refunds are not issued automatically inside the app. Email support@texttoposter.com with your account email, Waffo order ID, and the reason for the request.",
      ],
      [
        "After cancellation",
        "Canceling a subscription preserves Pro access until the current period ends. Unused credits are not paid out and do not roll into a later period.",
      ],
      [
        "Payment provider",
        "Waffo processes checkout, subscription billing, and payment events. Include the Waffo order ID in a support request so we can locate the purchase. Refunds are not automatically issued inside the app.",
      ],
    ],
  },
  "ai-policy": {
    title: "AI use, clearly stated.",
    intro:
      "Text to Poster is a generative image tool. This policy explains what the system does, what you must review, and how to report harmful or infringing output.",
    sections: [
      [
        "What is AI-generated",
        "The poster directions and images produced by the studio are generated by an automated image model through APIMart. The product marks results as AI-generated. Outputs are not photographs, eyewitness evidence, or guaranteed statements of fact.",
      ],
      [
        "Before you publish",
        "Review every output for accuracy, bias, spelling, unwanted resemblance, privacy issues, and rights clearance. Add an AI-generated disclosure whenever required by law, a platform, a client, or the context of publication. Do not use a generated poster to mislead people about a real person, event, endorsement, or product claim.",
      ],
      [
        "Prohibited requests",
        "Do not request child sexual abuse material, sexualized depictions of identifiable people without consent, impersonation, deceptive deepfakes, targeted harassment, hateful abuse, threats, fraud, illegal instructions, or content that violates another person’s privacy or intellectual-property rights.",
      ],
      [
        "Your rights and responsibility",
        "Only submit text, names, logos, images, and likenesses that you have the right and permission to process. You are responsible for the prompt and for the way you use or publish the result. A prompt alone does not guarantee copyright in an output; human creative selection, arrangement, and modification may matter under applicable law.",
      ],
      [
        "Reporting and action",
        "Email support@texttoposter.com to report harmful, unlawful, privacy-invading, or infringing content. Include the generation ID or account email, the reason for the report, and any evidence of your rights. We may restrict access, remove an asset, preserve relevant logs, or cooperate with a valid legal request.",
      ],
      [
        "Limits",
        "Automated safeguards cannot catch every harmful or infringing request, and the service may refuse legitimate content by mistake. Do not rely on Text to Poster as a safety, identity, copyright, or factual-verification system.",
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
          <Link href="/ai-policy">AI use</Link>
        </nav>
      </footer>
    </main>
  );
}
