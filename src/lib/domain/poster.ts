import { z } from "zod";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  QUALITIES,
  type Quality,
  RESOLUTIONS,
  type Resolution,
} from "./credits";

export type { AspectRatio, ImageCount, Quality, Resolution } from "./credits";
export {
  ASPECT_RATIOS,
  IMAGE_COUNTS,
  isAspectRatio,
  isResolution,
  QUALITIES,
  RESOLUTIONS,
} from "./credits";

export const STYLES = [
  "auto",
  "movie",
  "minimal",
  "anime",
  "business",
  "vintage",
  "neon",
  "swiss",
  "typography",
  "collage",
  "photography",
  "illustration",
  "surreal",
  "fashion",
  "brutalist",
  "art_deco",
  "y2k",
] as const;
export type PosterStyle = (typeof STYLES)[number];

export const styleLabels: Readonly<Record<PosterStyle, string>> = {
  auto: "Auto",
  movie: "Movie",
  minimal: "Minimal",
  anime: "Anime",
  business: "Business",
  vintage: "Vintage",
  neon: "Neon",
  swiss: "Swiss",
  typography: "Typography",
  collage: "Collage",
  photography: "Photography",
  illustration: "Illustration",
  surreal: "Surreal",
  fashion: "Fashion",
  brutalist: "Brutalist",
  art_deco: "Art Deco",
  y2k: "Y2K",
};

export const FEATURED_STYLES = [
  "auto",
  "movie",
  "minimal",
  "anime",
  "business",
  "vintage",
  "neon",
] as const satisfies readonly PosterStyle[];

export const MORE_STYLE_GROUPS = [
  { label: "Editorial", styles: ["swiss", "typography", "collage"] },
  {
    label: "Image-led",
    styles: ["photography", "illustration", "surreal"],
  },
  {
    label: "Statement",
    styles: ["fashion", "brutalist", "art_deco", "y2k"],
  },
] as const satisfies readonly Readonly<{
  label: string;
  styles: readonly PosterStyle[];
}>[];

export function isMoreStyle(style: PosterStyle): boolean {
  return MORE_STYLE_GROUPS.some((group) =>
    group.styles.some((candidate) => candidate === style),
  );
}

export const aspectLabels: Readonly<Record<AspectRatio, string>> = {
  "1:1": "Square",
  "4:5": "Portrait",
  "3:4": "Editorial",
  "2:3": "Classic",
  "9:16": "Story",
  "16:9": "Wide",
  "4:3": "Slide",
  "3:2": "Landscape",
};

export const generationRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
  style: z.enum(STYLES),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  quality: z.enum(QUALITIES),
  imageCount: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type ProviderQuality = "low" | Quality;

export type GenerationMode = "guest" | "free" | "pro";

export type GenerationStatus =
  | "submitted"
  | "processing"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "timed_out";

export type GenerationImage = Readonly<{
  id: string;
  url: string;
  alt: string;
  watermarked: boolean;
}>;

export type GenerationResponse = Readonly<{
  id: string;
  status: GenerationStatus;
  progress: number;
  images: readonly GenerationImage[];
  imageCount: number;
  error?: string | undefined;
  creditsReserved: number;
  creditsConsumed?: number | undefined;
  nextPollAt?: string | undefined;
}>;

export const generationResponseSchema = z.object({
  id: z.string(),
  status: z.enum([
    "submitted",
    "processing",
    "succeeded",
    "partially_succeeded",
    "failed",
    "timed_out",
  ]),
  progress: z.number().int().min(0).max(100),
  images: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      alt: z.string(),
      watermarked: z.boolean(),
    }),
  ),
  imageCount: z.number().int().min(1).max(4),
  error: z.string().optional(),
  creditsReserved: z.number().int().nonnegative(),
  creditsConsumed: z.number().int().nonnegative().optional(),
  nextPollAt: z.string().optional(),
});

export const generationAcceptedSchema = generationResponseSchema.pick({
  id: true,
  status: true,
  progress: true,
  creditsReserved: true,
  nextPollAt: true,
});

export function isProGeneration(
  mode: GenerationMode,
  resolution: Resolution,
  quality: Quality,
): boolean {
  return mode === "pro" && (resolution !== "1k" || quality !== "medium");
}
