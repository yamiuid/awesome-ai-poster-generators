import Image from "next/image";
import { redirect } from "next/navigation";
import { PosterContentPage } from "@/components/poster-content-page";
import { Link } from "@/i18n/navigation";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { type RouteParams, resolveRouteLocale } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-static";
export const metadata = pageMeta({
  title: "Poster Design Ideas: 6 AI Styles & Example Prompts | Text to Poster",
  description:
    "Explore six poster design ideas with real AI-generated examples and reusable prompts: movie, minimal, anime, business, vintage and neon. Try each style online.",
  path: "/poster-design-ideas",
  localizedAlternates: false,
});

const designNotes: Readonly<Record<string, string>> = {
  movie:
    "Use one striking scene to express the story. A limited palette and a small subject against a large background can suggest tension without explaining the entire plot.",
  minimal:
    "This educational poster organizes an AI topic with a large headline, one silhouette and a row of supporting icons. Keep each section short so the reading order stays clear.",
  anime:
    "Make the setting part of the invitation. A rooftop, sunset and city skyline give an arcade event a sense of place; adapt the scene to your own original concept.",
  business:
    "This product announcement makes the version number the focal point and surrounds it with sample artwork. Keep one launch message dominant and place the action at the bottom.",
  vintage:
    "Pair a familiar music symbol with warm ink and paper texture. A guitar and sun can communicate an intimate live session more directly than a long description.",
  neon: "Use light to establish a nighttime mood. Contrast a dark setting with cyan and magenta highlights, while keeping the event name readable against the busy scene.",
} as const;

const ideaExamples = POSTER_EXAMPLES.map((example) => {
  if (example.style === "minimal") {
    return {
      ...example,
      label: "Educational",
      prompt:
        "Educational poster about artificial intelligence, cream and navy palette, profile silhouette with a circuit motif, large headline and short supporting sections.",
      alt: "Artificial intelligence educational poster with a navy profile silhouette, circuit motif and supporting icons on cream paper.",
    };
  }
  if (example.style === "business") {
    return {
      ...example,
      label: "Product launch",
      prompt:
        "Product launch poster for TextToPoster 2.0, dark background, large white and violet version number, sample poster collage and a clear call to action.",
      alt: "TextToPoster 2.0 product announcement with a large version number, violet lighting and sample poster collage.",
    };
  }
  return example;
});

export default async function PosterIdeasPage({ params }: RouteParams) {
  if ((await resolveRouteLocale(params)) !== "en")
    redirect("/poster-design-ideas");
  return (
    <PosterContentPage
      path="/poster-design-ideas"
      title="Poster Design Ideas: Six Directions to Try"
      intro="Explore artwork already used in Text to Poster. Each example pairs a suggested prompt with a design principle you can adapt. Prompts are starting points, not a guarantee of reproducing the image. These are inspiration examples, not editable poster templates."
    >
      <section aria-labelledby="ideas-heading">
        <h2 id="ideas-heading">Choose the idea that fits your message</h2>
        <p>
          Start with the purpose: a film announcement, exhibition, conference or
          live show. Then choose a visual direction. Copy an example prompt and
          replace the subject, colors and required words with your own brief.
        </p>
        <div className="examples-grid movie-direction-grid">
          {ideaExamples.map((example, index) => (
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
                <h3>{example.label} poster idea</h3>
                <p>{designNotes[example.style]}</p>
                <p>
                  <strong>Suggested prompt:</strong> {example.prompt}
                </p>
                <Link
                  className="pricing-link"
                  href={`/?style=${example.style}#studio`}
                >
                  Try {example.label.toLowerCase()} art direction
                </Link>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section aria-labelledby="adapt-heading">
        <h2 id="adapt-heading">Turn inspiration into your own brief</h2>
        <ol className="style-landing-list">
          <li>
            Keep the design principle, such as a limited palette or one strong
            subject.
          </li>
          <li>
            Replace the scene and headline with your own event, product or
            story.
          </li>
          <li>Specify the intended format and keep essential text short.</li>
          <li>Compare results and review all text before sharing.</li>
        </ol>
        <p>
          Want a complete walkthrough?{" "}
          <Link href="/how-to-make-a-poster">
            Learn how to make a poster with AI
          </Link>
          . For dates, venues and ticket details, use the{" "}
          <Link href="/event-poster-maker">event poster maker guide</Link>.
        </p>
      </section>
    </PosterContentPage>
  );
}
