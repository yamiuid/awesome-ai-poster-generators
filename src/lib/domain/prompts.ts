import type { AspectRatio, GenerationRequest, PosterStyle } from "./poster";

const STYLE_INSTRUCTIONS: Readonly<Record<PosterStyle, string>> = {
  movie:
    "cinematic key art, dramatic lighting, premium film typography, layered depth",
  minimal:
    "editorial minimalism, generous negative space, precise geometry, restrained palette",
  anime:
    "high-end anime key visual, expressive characters, clean cel shading, dynamic composition",
  business:
    "confident modern brand campaign, clear hierarchy, polished commercial art direction",
  vintage:
    "screen-printed vintage poster, tactile paper grain, limited ink palette, retro lettering",
  neon: "electric neon nightlife, bold glow, high contrast, futuristic club poster energy",
};

const RATIO_INSTRUCTIONS: Readonly<Record<AspectRatio, string>> = {
  "1:1": "balanced square composition",
  "4:5": "portrait social poster composition",
  "2:3": "classic vertical poster composition",
  "16:9": "wide cinematic poster composition",
};

export function buildPosterPrompt(request: GenerationRequest): string {
  return [
    "Create a finished English-language poster, not a mockup and not a blank template.",
    `Core idea: ${request.prompt}`,
    `Art direction: ${STYLE_INSTRUCTIONS[request.style]}.`,
    `Layout: ${RATIO_INSTRUCTIONS[request.aspectRatio]}.`,
    "Use legible, correctly spelled display text only when the idea calls for text; keep hierarchy intentional and avoid watermark-like artifacts.",
    "Return one polished poster variation with a clear focal point and production-ready composition.",
  ].join(" ");
}
