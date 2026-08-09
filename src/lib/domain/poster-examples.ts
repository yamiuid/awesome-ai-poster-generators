import type { PosterStyle } from "./poster";

export type PosterExample = Readonly<{
  style: PosterStyle;
  label: string;
  prompt: string;
  image: string;
  alt: string;
}>;

export const POSTER_EXAMPLES: readonly PosterExample[] = [
  {
    style: "movie",
    label: "Movie",
    prompt:
      "Independent film premiere, a lone figure under a red moon, art-house tension.",
    image: "/examples/movie-midnight-signal.webp",
    alt: "A black, cream, and red independent film poster with a lone figure beneath a red moon.",
  },
  {
    style: "minimal",
    label: "Minimal",
    prompt:
      "Design exhibition, strict geometric forms, warm cream paper, black and red.",
    image: "/examples/minimal-form-field.webp",
    alt: "A minimalist design exhibition poster made from black and red geometric forms on cream paper.",
  },
  {
    style: "anime",
    label: "Anime",
    prompt:
      "Original anime-inspired rooftop arcade event at sunset, glowing city skyline.",
    image: "/examples/anime-skyline-club.webp",
    alt: "An original anime-inspired rooftop arcade poster with a glowing city skyline at sunset.",
  },
  {
    style: "business",
    label: "Business",
    prompt:
      "Future of work conference, architectural silhouette, calm blue and orange grid.",
    image: "/examples/business-next-shift.webp",
    alt: "A business conference poster with an architectural silhouette, blue grid, and orange accents.",
  },
  {
    style: "vintage",
    label: "Vintage",
    prompt:
      "Live music session, 1970s screen print, sun, guitar, olive and burnt orange.",
    image: "/examples/vintage-sunroom-sessions.webp",
    alt: "A vintage screen-printed live music poster with a sun, guitar, flowers, and warm paper grain.",
  },
  {
    style: "neon",
    label: "Neon",
    prompt:
      "Midnight jazz festival in a rain-soaked city, copper type, quiet luxury.",
    image: "/examples/neon-after-dark.webp",
    alt: "A neon jazz poster showing a saxophone player on a rainy city street with cyan and magenta lights.",
  },
];
