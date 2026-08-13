import type { PosterStyle } from "./poster";

export type StyleLanding = Readonly<{
  slug: string;
  style: PosterStyle;
  label: string;
  linkLabel: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  promptLead: string;
  promptTips: readonly string[];
  cta: string;
  faqs: readonly (readonly [string, string])[];
}>;

export const STYLE_LANDINGS: readonly StyleLanding[] = [
  {
    slug: "movie-poster-maker",
    style: "movie",
    label: "Movie",
    linkLabel: "Movie poster maker",
    title: "Movie Poster Maker - Generate Film Posters from Text",
    h1: "Movie Poster Maker - Turn a Logline into a Film Poster",
    description:
      "Turn a logline, title, or single scene into multiple movie-poster directions. Compare cinematic layouts and pick the one that feels like the film.",
    intro:
      "A movie poster has to do a lot in one frame: name the film, set the mood, and make someone stop scrolling. The movie style turns a short brief into several cinematic directions so you can choose the composition that fits before you commit to a finished design.",
    promptLead: "For a stronger movie-poster brief, include:",
    promptTips: [
      "A title or working title, plus a short tagline.",
      "The genre and era: noir, indie, sci-fi, 1970s, and so on.",
      "One key scene or image, such as a lone figure under a red moon.",
      "The mood you want people to feel: tension, romance, dread, adventure.",
      "A portrait ratio for one-sheets, or a landscape ratio for screen and social.",
    ],
    cta: "Describe a film night, screening, or short film, and generate several movie-poster directions to compare.",
    faqs: [
      [
        "Can I make a movie poster from a short text prompt?",
        "Yes. Start with a title and one scene. The studio turns that into multiple compositions, so you can compare hierarchy, color, and type before refining the prompt.",
      ],
      [
        "What aspect ratio should a movie poster use?",
        "Portrait works for classic one-sheets and film-night flyers. The studio lets you choose the ratio before generating, so pick the one that matches where the poster will live.",
      ],
      [
        "Can I include the film title and tagline?",
        "Describe the title and tagline in your brief. Review the text carefully, because AI image generation can misspell or change names, dates, and logos.",
      ],
    ],
  },
  {
    slug: "minimal-poster-generator",
    style: "minimal",
    label: "Minimal",
    linkLabel: "Minimal poster generator",
    title: "Minimal Poster Generator - Clean Layouts from Text",
    h1: "Minimal Poster Generator - Strong Type, Less Noise",
    description:
      "Generate clean, minimal posters from a short text brief. Turn one subject into restrained layouts with strong type, geometry, and negative space.",
    intro:
      "Some ideas get stronger when you remove everything that is not essential. The minimal style uses simple geometry, a limited palette, and generous negative space to turn a short brief into a clear poster direction for exhibitions, talks, and launches.",
    promptLead: "A strong minimal brief usually names:",
    promptTips: [
      "The subject: an exhibition, talk, product, or statement.",
      "A two- or three-color palette, like black, red, and cream.",
      "The feeling of the layout: strict, calm, editorial, architectural.",
      "Any words that must appear, kept short.",
      "The format and whether the layout should feel square or tall.",
    ],
    cta: "Describe a clean idea and generate several minimal layouts to compare.",
    faqs: [
      [
        "What makes a good minimal poster prompt?",
        "Keep it short and specific: one subject, one mood, and a limited palette. The more restraint in the brief, the cleaner the result tends to be.",
      ],
      [
        "Can a minimal poster still have strong typography?",
        "Yes. Describe the words you want to appear and how the type should feel. Review the output carefully, because AI can alter small words or punctuation.",
      ],
      [
        "Which format works best for a minimal poster?",
        "Square and tall formats both work well. Choose based on where the poster will appear: a feed, a wall, or a print flyer.",
      ],
    ],
  },
  {
    slug: "anime-poster-maker",
    style: "anime",
    label: "Anime",
    linkLabel: "Anime poster maker",
    title: "Anime Poster Maker - Generate Anime Posters from Text",
    h1: "Anime Poster Maker - Turn a Prompt into an Anime Direction",
    description:
      "Turn a text prompt into anime-inspired posters. Describe a character, scene, and color mood, and compare multiple anime directions in seconds.",
    intro:
      "For original characters, fan events, streams, and illustrated projects, the anime style turns a text prompt into a layered anime-inspired scene with glowing skylines and a clear focal point.",
    promptLead: "Include these details for a stronger anime direction:",
    promptTips: [
      "The character or subject and what they are doing.",
      "The setting: a rooftop, a station, a festival, a classroom.",
      "The time of day and light: sunset, night, morning glow.",
      "A color mood: warm, cold, neon, pastel.",
      "The composition you want, such as a hero pose or wide skyline shot.",
    ],
    cta: "Describe an original scene and generate several anime poster directions.",
    faqs: [
      [
        "Can I make an anime poster without drawing?",
        "Yes. Describe the character, scene, and mood, and the studio generates the direction for you. You still own the creative direction and final edit.",
      ],
      [
        "What should I put in an anime poster prompt?",
        "Name the subject, setting, time of day, and color mood. A specific scene usually gives a more interesting result than a vague one.",
      ],
      [
        "Can I use the result for an event or stream?",
        "Yes, subject to the image provider terms and your rights to any character or name you reference. Review names and likenesses before publishing.",
      ],
    ],
  },
  {
    slug: "business-poster-generator",
    style: "business",
    label: "Business",
    linkLabel: "Business poster generator",
    title: "Business Poster Generator - Corporate Posters from Text",
    h1: "Business Poster Generator - Calm Layouts for Clear Messages",
    description:
      "Generate business and conference posters from text. Describe the event, audience, and tone for clean, professional corporate layouts.",
    intro:
      "For conferences, internal events, product launches, and client updates, the business style turns a brief into a calm, professional poster with architecture-like structure, clear hierarchy, and a restrained palette.",
    promptLead: "A useful business brief includes:",
    promptTips: [
      "The event or message and the audience.",
      "The tone: formal, optimistic, technical, human.",
      "Any key copy, such as a headline or date.",
      "A palette that matches the brand, or let the studio choose.",
      "The format: screen, handout, or stage backdrop.",
    ],
    cta: "Describe a launch, conference, or internal update and generate several business directions.",
    faqs: [
      [
        "Can I make a conference poster from text?",
        "Yes. Describe the event, audience, and tone, and the studio returns multiple business-style directions to compare.",
      ],
      [
        "Should I include the date and headline?",
        "Yes, if they are finalized. Review them carefully in the output, because AI text can change numbers and words.",
      ],
      [
        "What format is best for a business poster?",
        "Landscape works well for screens and stage backdrops; portrait works for flyers and printed one-pagers.",
      ],
    ],
  },
  {
    slug: "vintage-poster-maker",
    style: "vintage",
    label: "Vintage",
    linkLabel: "Vintage poster maker",
    title: "Vintage Poster Maker - Retro Posters from Text",
    h1: "Vintage Poster Maker - Warm, Screen-Printed Directions",
    description:
      "Create vintage, screen-printed posters from text. Describe a subject and era for warm, textured retro layouts with sun-bleached palettes.",
    intro:
      "For music events, markets, film screenings, and anything with a little nostalgia, the vintage style uses screen-print texture, warm paper grain, and retro palettes to turn a short brief into a poster that feels hand-made.",
    promptLead: "For a convincing vintage direction, include:",
    promptTips: [
      "The subject and event: a band, market, screening, or product.",
      "The era or reference: 1960s, 1970s screen print, mid-century.",
      "A warm palette: olive, burnt orange, cream, faded red.",
      "Key copy, kept short for a retro look.",
      "The format, since screen-print layouts read differently at each ratio.",
    ],
    cta: "Describe a live session, market, or screening and generate several vintage directions.",
    faqs: [
      [
        "What makes a vintage poster look authentic?",
        "A limited warm palette, paper texture, and confident typography help. Mention the era and palette in your brief.",
      ],
      [
        "Can I make a music event poster from text?",
        "Yes. Describe the act, date, and mood, and the vintage style will return warm, screen-printed directions.",
      ],
      [
        "Should I include the band or venue name?",
        "Only if you have the rights to use it. Review the spelling carefully in the generated output.",
      ],
    ],
  },
  {
    slug: "neon-poster-generator",
    style: "neon",
    label: "Neon",
    linkLabel: "Neon poster generator",
    title: "Neon Poster Generator - Night Posters from Text",
    h1: "Neon Poster Generator - Glowing Scenes, Strong Type",
    description:
      "Generate neon posters from text. Describe a night scene, subject, and color mood for glowing, atmospheric layouts with strong type.",
    intro:
      "For night markets, jazz nights, club events, and late-city stories, the neon style turns a brief into a glowing, rain-soaked scene with cyan and magenta light and confident type.",
    promptLead: "For a stronger neon direction, include:",
    promptTips: [
      "The subject and the night scene around it.",
      "The light: neon signs, street lamps, reflections, rain.",
      "A two- or three-color glow: cyan, magenta, copper, or blue.",
      "The mood: quiet luxury, energy, nostalgia, mystery.",
      "Any short headline or venue copy.",
    ],
    cta: "Describe a night scene or event and generate several neon directions.",
    faqs: [
      [
        "What should I put in a neon poster prompt?",
        "Name the subject, the night setting, the glow colors, and the mood. Specific light details make the result feel more considered.",
      ],
      [
        "Can I add a venue or event name?",
        "Yes, describe it in the brief. Review the spelling in the output, because AI can alter small text.",
      ],
      [
        "Which format works for a neon poster?",
        "Portrait suits event flyers and social posts; landscape suits screens and stage backdrops.",
      ],
    ],
  },
];

export function getStyleLanding(slug: string): StyleLanding {
  const landing = STYLE_LANDINGS.find((item) => item.slug === slug);
  if (!landing) {
    throw new Error(`Unknown style landing: ${slug}`);
  }
  return landing;
}
