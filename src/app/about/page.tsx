import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "About | Text to Poster",
  description:
    "Text to Poster turns a written brief into up to four poster directions in seconds. Built by a small independent team on Next.js, Supabase, and GPT Image 2.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <main className="legal-page">
      <SiteHeader />
      <article className="legal-copy">
        <p className="eyebrow">Text to Poster / about</p>
        <h1>The tool we wanted for our own client work.</h1>
        <p className="legal-intro">
          Text to Poster is a small, independent project: an AI poster maker
          that turns a written brief into up to four poster directions in
          seconds. No templates, no drag-and-drop — describe the mood, subject,
          or words, and compare different visual readings at once.
        </p>
        <section>
          <h2>Why it exists</h2>
          <p>
            Early concepts are fragile. A brief that lives only in your head is
            hard to share with a client, a team, or your own taste. We wanted a
            tool that makes a first draft cheap: type a sentence, get one to
            four directions, and only then decide which one deserves real design
            time. That is the whole product.
          </p>
        </section>
        <section>
          <h2>How it works</h2>
          <p>
            Your brief is turned into a structured prompt and sent to GPT Image
            2 through APIMart, our image-generation provider. The studio renders
            up to four compositions per run, stores them privately in your
            account, and keeps free runs watermarked so anyone can try it before
            paying. Creator and Studio plans unlock full resolution, quality
            presets, and up to four posters per run.
          </p>
        </section>
        <section>
          <h2>What we care about</h2>
          <p>
            Generated images stay private by default — there is no public
            gallery. Free limits are enforced with a salted, hashed guest key
            rather than raw IP or browser data, prompts and outputs are never
            sold or used for advertising profiles, and every paid charge is
            processed by Waffo as the merchant of record. We publish our privacy
            policy, terms, refund rule, and AI-use policy in the footer so you
            can read exactly what happens to your material.
          </p>
        </section>
        <section>
          <h2>Who is behind it</h2>
          <p>
            A one-person studio that spends too much time on poster layouts. If
            you have feedback, a use case, or a bug to report, email{" "}
            <a href="mailto:support@texttoposter.com">
              support@texttoposter.com
            </a>{" "}
            — real people read it.
          </p>
        </section>
        <section>
          <h2>Transparency</h2>
          <p>
            Text to Poster does not claim to own or represent the underlying
            image model. Generation is provided through APIMart&rsquo;s
            gpt-image-2-official endpoint; review the AI use policy before
            publishing output where disclosure is required.
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
