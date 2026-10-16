import type { PosterStyle } from "./poster";
import type { PosterExample } from "./poster-examples";
import { POSTER_EXAMPLES } from "./poster-examples";
import { PRACTICAL_POSTER_IDEAS } from "./poster-ideas";

const additionalExamples: Partial<
  Record<PosterStyle, readonly PosterExample[]>
> = {
  anime: [
    {
      style: "anime",
      label: "After the Monsoon",
      prompt:
        "Three friends race bicycles across a flooded elevated train line toward a glowing city after the monsoon. Use a hand-painted anime background, a violet storm opening into a turquoise sunset, a strong triangular composition, and coral and electric-blue accents.",
      image: "/examples/movie-after-the-monsoon.webp",
      alt: "Anime coming-of-age poster with three cyclists heading toward a glowing city after a storm.",
    },
  ],
  neon: [
    {
      style: "neon",
      label: "Neon crime",
      prompt:
        "A neon crime poster set inside a 1980s hotel casino during a citywide blackout. Show a stolen diamond in a gloved hand and a getaway driver reflected in an elevator mirror, with cyan, magenta, and amber light across wet chrome.",
      image: "/examples/movie-velvet-switch.webp",
      alt: "Neon crime poster with a stolen diamond, masked getaway driver, and cyan and magenta casino light.",
    },
  ],
};

export function getStyleLandingExamples(
  style: PosterStyle,
): readonly PosterExample[] {
  return [
    ...POSTER_EXAMPLES.filter((example) => example.style === style),
    ...PRACTICAL_POSTER_IDEAS.filter((example) => example.style === style),
    ...(additionalExamples[style] ?? []),
  ];
}
