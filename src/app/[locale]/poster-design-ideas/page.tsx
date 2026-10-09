import Image from "next/image";
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
export async function generateMetadata({ params }: RouteParams) {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "posterIdeas" });
  return pageMeta({
    title: `${t("metaTitle")} | Text to Poster`,
    description: t("description"),
    path: "/poster-design-ideas",
    locale,
  });
}

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
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "posterIdeas" });
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
      title={t("title")}
      intro={t("intro")}
      locale={locale}
      contentClassName="poster-ideas-page"
      compactHero
    >
      <nav
        className="poster-content-nav idea-category-nav"
        aria-label={t("categories")}
      >
        {ideaGroups.map((group) => (
          <a key={group.id} href={`#${group.id}-ideas`}>
            {t(`groups.${group.id}`)}
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
              {t(`groups.${group.id}`)}
            </h2>
            <div className="idea-group-links">
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {t(`tools.${link.href.slice(1)}`)}{" "}
                  <span aria-hidden="true">↗</span>
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
                    alt={
                      locale === "en"
                        ? example.alt
                        : t("artworkAlt", { name: t(`examples.${example.id}`) })
                    }
                    width={1024}
                    height={1280}
                    sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
                  />
                  <figcaption>
                    <h3>{t(`examples.${example.id}`)}</h3>
                    <p className="idea-prompt" dir="ltr" lang="en">
                      {example.prompt}
                    </p>
                    <div className="idea-actions">
                      <CopyPromptButton
                        prompt={example.prompt}
                        label={example.label.toLowerCase()}
                        messages={{
                          copy: t("copy"),
                          copied: t("copied"),
                          unavailable: t("unavailable"),
                          ariaLabel: t("copyLabel", {
                            name: t(`examples.${example.id}`),
                          }),
                        }}
                      />
                      <Link
                        className="solid-button"
                        href={`/?style=${example.style}#studio`}
                        aria-label={t("createLabel", {
                          name: t(`examples.${example.id}`),
                        })}
                      >
                        {t("create")}
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
          <h2 id="adapt-heading">{t("usageTitle")}</h2>
          <p>{t("usage")}</p>
          <p className="idea-usage-note">{t("note")}</p>
        </div>
        <Link className="outline-button" href="/how-to-make-a-poster">
          {t("tutorial")} <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </PosterContentPage>
  );
}
