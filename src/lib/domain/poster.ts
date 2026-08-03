import { z } from "zod";
import {
  QUALITIES,
  type Quality,
  RESOLUTIONS,
  type Resolution,
} from "./credits";

export type { Quality, Resolution } from "./credits";
export { isResolution, QUALITIES, RESOLUTIONS } from "./credits";

export const STYLES = [
  "movie",
  "minimal",
  "anime",
  "business",
  "vintage",
  "neon",
] as const;
export type PosterStyle = (typeof STYLES)[number];

export const ASPECT_RATIOS = ["1:1", "4:5", "2:3", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const styleLabels: Readonly<Record<PosterStyle, string>> = {
  movie: "Movie",
  minimal: "Minimal",
  anime: "Anime",
  business: "Business",
  vintage: "Vintage",
  neon: "Neon",
};

export const aspectLabels: Readonly<Record<AspectRatio, string>> = {
  "1:1": "Square",
  "4:5": "Portrait",
  "2:3": "Classic",
  "16:9": "Wide",
};

export const generationRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
  style: z.enum(STYLES),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  quality: z.enum(QUALITIES),
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
  error?: string | undefined;
  creditsReserved: number;
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
  error: z.string().optional(),
  creditsReserved: z.number().int().nonnegative(),
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
