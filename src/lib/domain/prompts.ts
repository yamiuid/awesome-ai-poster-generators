import type { AspectRatio, GenerationRequest, PosterStyle } from "./poster";

const STYLE_INSTRUCTIONS: Readonly<Record<PosterStyle, string>> = {
  auto: "infer the single most suitable art direction from the core idea, its mood, subject, and intended audience; keep the visual language coherent rather than mixing unrelated styles",
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
  swiss:
    "Swiss International Style, asymmetric grid, precise sans-serif typography, disciplined negative space",
  typography:
    "type-led poster design, expressive display lettering, intentional hierarchy, graphic text composition",
  collage:
    "editorial cut-paper collage, layered found imagery, tactile edges, bold composition",
  photography:
    "art-directed editorial photography, deliberate lighting, strong focal framing, refined color grade",
  illustration:
    "contemporary editorial illustration, confident shapes, expressive linework, considered palette",
  surreal:
    "surreal conceptual imagery, unexpected scale and symbolism, dreamlike yet polished composition",
  fashion:
    "high-fashion campaign art direction, striking editorial pose, refined typography, confident negative space",
  brutalist:
    "raw brutalist graphic design, oversized type, stark contrast, deliberately uncompromising layout",
  art_deco:
    "Art Deco poster design, geometric symmetry, elegant ornament, luxe period typography",
  y2k: "Y2K pop graphic design, glossy chrome details, playful digital forms, optimistic turn-of-the-millennium energy",
};

const RATIO_INSTRUCTIONS: Readonly<Record<AspectRatio, string>> = {
  "1:1": "balanced square composition",
  "4:5": "portrait social poster composition",
  "3:4": "editorial portrait poster composition",
  "2:3": "classic vertical poster composition",
  "9:16": "full-height vertical mobile poster composition",
  "16:9": "wide cinematic poster composition",
  "4:3": "classic landscape poster composition",
  "3:2": "landscape poster composition with photographic framing",
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
