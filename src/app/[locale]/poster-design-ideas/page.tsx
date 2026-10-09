import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { PosterContentPage } from "@/components/poster-content-page";
import { Link } from "@/i18n/navigation";
import type { PosterStyle } from "@/lib/domain/poster";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { PRACTICAL_POSTER_IDEAS } from "@/lib/domain/poster-ideas";
import { type RouteParams, resolveRouteLocale } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-static";
export const metadata = pageMeta({
  title: "Poster Design Ideas & AI Prompts | Text to Poster",
  description:
    "Explore 12 creative poster design ideas for sales, cafes, hiring, events and more. Browse AI artwork, copy the prompts and create your own poster online.",
  path: "/poster-design-ideas",
  localizedAlternates: false,
});

const ideaExamples = POSTER_EXAMPLES.map((example) => {
  if (example.style === "minimal") {
    return {
      ...example,
      label: "Educational",
      alt: "Artificial intelligence educational poster with a navy profile silhouette, circuit motif and supporting icons on cream paper.",
    };
  }
  if (example.style === "business") {
    return {
      ...example,
      label: "Product launch",
      alt: "TextToPoster 2.0 product announcement with a large version number, violet lighting and sample poster collage.",
    };
  }
  return example;
});

const ideaGroups = [
  {
    id: "promotions",
    title: "Business & promotions",
    examples: ["weekend-sale", "coffee-special", "business"],
    links: [
      {
        href: "/business-poster-generator",
        label: "Business poster generator",
      },
    ],
  },
  {
    id: "events",
    title: "Events & community",
    examples: ["community-market", "vintage", "fitness-class"],
    links: [
      { href: "/event-poster-maker", label: "Event poster maker" },
      { href: "/vintage-poster-maker", label: "Vintage poster maker" },
    ],
  },
  {
    id: "entertainment",
    title: "Film & entertainment",
    examples: ["movie", "anime", "neon"],
    links: [
      { href: "/movie-poster-maker", label: "Movie poster maker" },
      { href: "/anime-poster-maker", label: "Anime poster maker" },
      { href: "/neon-poster-generator", label: "Neon poster generator" },
    ],
  },
  {
    id: "education",
    title: "Education & careers",
    examples: ["minimal", "small-business-workshop", "now-hiring"],
    links: [
      { href: "/minimal-poster-generator", label: "Minimal poster generator" },
    ],
  },
] as const;

export default async function PosterIdeasPage({ params }: RouteParams) {
  if ((await resolveRouteLocale(params)) !== "en")
    redirect("/poster-design-ideas");
  const studio = await getTranslations({ locale: "en", namespace: "studio" });
  const generatorPrompts: Partial<Record<PosterStyle, string>> = {
    minimal: studio("exampleArticlePrompt"),
    business: studio("exampleAnnouncementPrompt"),
    neon: studio("exampleEventPrompt"),
  };
  const galleryExamples = [
    ...ideaExamples.map((example) => ({
      ...example,
      id: example.style,
      prompt: generatorPrompts[example.style] ?? example.prompt,
    })),
    ...PRACTICAL_POSTER_IDEAS,
  ];
  return (
    <PosterContentPage
      path="/poster-design-ideas"
      title="Poster Design Ideas"
      intro="Find a look you love. Copy the prompt. Make it yours."
      contentClassName="poster-ideas-page"
      compactHero
    >
      <nav
        className="poster-content-nav idea-category-nav"
        aria-label="Poster ideas by purpose"
      >
        {ideaGroups.map((group) => (
          <a key={group.id} href={`#${group.id}-ideas`}>
            {group.title}
          </a>
        ))}
      </nav>
      {ideaGroups.map((group, index) => (
        <section
          className="idea-group"
          aria-labelledby={`${group.id}-ideas`}
          key={group.id}
        >
          <div className="idea-group-header">
            <h2 id={`${group.id}-ideas`}>
              <span className="idea-group-number" aria-hidden="true">
                0{index + 1}
              </span>
              {group.title}
            </h2>
            <div className="idea-group-links">
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label} <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="examples-grid poster-ideas-grid">
            {group.examples.map((id) => {
              const example = galleryExamples.find((item) => item.id === id);
              if (!example) return null;
              return (
                <figure
                  className="example-poster"
                  id={`${example.id}-idea`}
                  key={example.id}
                >
                  <Image
                    className="example-poster-image"
                    src={example.image}
                    alt={example.alt}
                    width={1024}
                    height={1280}
                    sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
                  />
                  <figcaption>
                    <h3>{example.label}</h3>
                    <p className="idea-prompt">{example.prompt}</p>
                    <div className="idea-actions">
                      <CopyPromptButton
                        prompt={example.prompt}
                        label={example.label.toLowerCase()}
                      />
                      <Link
                        className="solid-button"
                        href={`/?style=${example.style}#studio`}
                        aria-label={`Create ${example.label.toLowerCase()} poster`}
                      >
                        Create poster
                      </Link>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ))}
      <section className="idea-usage" aria-labelledby="adapt-heading">
        <div>
          <h2 id="adapt-heading">Your idea. Your poster.</h2>
          <p>
            Replace the sample text, dates and venue, then review your result
            before sharing.
          </p>
          <p className="idea-usage-note">
            AI artwork, not editable templates. Results vary. The educational
            example uses an article URL as its input.
          </p>
        </div>
        <Link className="outline-button" href="/how-to-make-a-poster">
          How to make a poster <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </PosterContentPage>
  );
}
