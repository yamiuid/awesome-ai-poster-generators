import type { UiLocale } from "@/lib/i18n/locale";
import type { AspectRatio, GenerationRequest, PosterStyle } from "./poster";

export const PROMPT_LANGUAGES = [
  "en",
  "zh-Hans",
  "zh-TW",
  "ja",
  "es-419",
  "ar",
] as const;
export type PromptLanguage = (typeof PROMPT_LANGUAGES)[number];

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

function promptLanguageForLocale(locale: UiLocale): PromptLanguage {
  switch (locale) {
    case "zh-TW":
      return "zh-TW";
    case "ja":
      return "ja";
    case "es":
      return "es-419";
    case "ar":
      return "ar";
    case "en":
      return "en";
    default:
      return assertNever(locale);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected prompt language value: ${String(value)}`);
}

function containsTraditionalChinese(text: string): boolean {
  return /[邊樂組臺灣體後廣發設計產業帳戶]/u.test(text);
}

function containsSimplifiedChinese(text: string): boolean {
  return /[边乐组台湾体后广发设计产业账户]/u.test(text);
}

function containsSpanishSignals(text: string): boolean {
  return (
    /[¿¡ñáéíóúü]/iu.test(text) ||
    /\b(el|la|los|las|una|para|con|que|de|y|música|verano)\b/iu.test(text)
  );
}

export function isAmbiguousLatinPrompt(text: string): boolean {
  return (
    !/[\u0600-\u06ff\u0750-\u077f\u3040-\u30ff\u3400-\u9fff]/u.test(text) &&
    !containsSpanishSignals(text)
  );
}

export function detectTextLanguage(
  text: string,
  fallbackLocale: UiLocale = "en",
): PromptLanguage {
  if (/[\u0600-\u06ff\u0750-\u077f]/u.test(text)) {
    return "ar";
  }
  if (/[\u3040-\u30ff]/u.test(text)) {
    return "ja";
  }
  if (containsTraditionalChinese(text)) {
    return "zh-TW";
  }
  if (containsSimplifiedChinese(text)) {
    return "zh-Hans";
  }
  if (containsSpanishSignals(text)) {
    return "es-419";
  }
  return promptLanguageForLocale(fallbackLocale);
}

function languageInstruction(language: PromptLanguage): string {
  switch (language) {
    case "zh-Hans":
      return "All poster text must be written in Simplified Chinese. Do not use English or any other non-Chinese language for any text on the poster.";
    case "zh-TW":
      return "All poster text must be written in Traditional Chinese using Taiwan usage and punctuation. Do not use Simplified Chinese, English, or any other non-Chinese language for any text on the poster.";
    case "ja":
      return "All poster text must be written in natural Japanese. Use appropriate Japanese punctuation and do not use English or any other non-Japanese language for poster copy unless it is part of a proper name supplied in the brief.";
    case "es-419":
      return "All poster text must be written in neutral Latin American Spanish. Use correct accents, inverted punctuation, and natural gender and number agreement. Do not use English or any other non-Spanish language for poster copy unless it is part of a proper name supplied in the brief.";
    case "ar":
      return "All poster text must be written in Modern Standard Arabic with natural Arabic punctuation and right-to-left reading order. Do not use English or any other non-Arabic language for poster copy unless it is part of a proper name supplied in the brief.";
    case "en":
      return "All poster text must be written in English. Do not use Chinese characters or any other non-English language for any text on the poster.";
    default:
      return assertNever(language);
  }
}

export function buildPosterPrompt(
  request: GenerationRequest,
  options?: Readonly<{
    hasReferenceImage?: boolean;
    textLanguage?: PromptLanguage;
  }>,
): string {
  const textLanguage =
    options?.textLanguage ??
    detectTextLanguage(request.prompt, request.siteLocale);
  return [
    "Create a finished poster, not a mockup and not a blank template.",
    languageInstruction(textLanguage),
    ...(options?.hasReferenceImage
      ? [
          "Use the provided reference image as the primary visual material: keep its subject and composition recognizable, and build a polished poster around it. Do not copy any text, logos, or watermarks from the reference image.",
        ]
      : []),
    `Core idea: ${request.prompt}`,
    `Art direction: ${STYLE_INSTRUCTIONS[request.style]}.`,
    `Layout: ${RATIO_INSTRUCTIONS[request.aspectRatio]}.`,
    "Use legible, correctly spelled display text only when the idea calls for text; keep hierarchy intentional and avoid watermark-like artifacts.",
    "Return one polished poster variation with a clear focal point and production-ready composition.",
  ].join(" ");
}
