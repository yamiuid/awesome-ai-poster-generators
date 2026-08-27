export const RESOLUTIONS = ["1k", "2k", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const QUALITIES = ["low", "medium", "high"] as const;
export type Quality = (typeof QUALITIES)[number];

export const ASPECT_RATIOS = [
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
  "16:9",
  "4:3",
  "3:2",
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const IMAGE_COUNTS = [1, 2, 3, 4] as const;
export type ImageCount = (typeof IMAGE_COUNTS)[number];

export const IMAGES_PER_GENERATION = 4 as const;

/**
 * GPT Image 2 官方通道（gpt-image-2-official）实际简化扣费档（积分/张）。
 * 参考 prompt-peek-gallery/docs/apimart-image-pricing-and-credit-policy.md：
 * 官方通道按 分辨率 × 质量 × 宽高比 三维计费，本项目仅开放 1:1 / 4:5 / 2:3 / 16:9。
 */
const OFFICIAL_CREDIT_COSTS = {
  "1k": {
    low: {
      "1:1": 2,
      "4:5": 2,
      "3:4": 2,
      "2:3": 2,
      "9:16": 2,
      "16:9": 2,
      "4:3": 2,
      "3:2": 2,
    },
    medium: {
      "1:1": 10,
      "4:5": 10,
      "3:4": 10,
      "2:3": 16,
      "9:16": 16,
      "16:9": 10,
      "4:3": 10,
      "3:2": 16,
    },
    high: {
      "1:1": 38,
      "4:5": 56,
      "3:4": 56,
      "2:3": 56,
      "9:16": 56,
      "16:9": 56,
      "4:3": 56,
      "3:2": 56,
    },
  },
  "2k": {
    low: {
      "1:1": 4,
      "4:5": 6,
      "3:4": 6,
      "2:3": 4,
      "9:16": 4,
      "16:9": 4,
      "4:3": 4,
      "3:2": 4,
    },
    medium: {
      "1:1": 38,
      "4:5": 47,
      "3:4": 47,
      "2:3": 28,
      "9:16": 28,
      "16:9": 28,
      "4:3": 28,
      "3:2": 28,
    },
    high: {
      "1:1": 149,
      "4:5": 186,
      "3:4": 186,
      "2:3": 112,
      "9:16": 112,
      "16:9": 112,
      "4:3": 112,
      "3:2": 112,
    },
  },
  "4k": {
    low: {
      "1:1": 8,
      "4:5": 8,
      "3:4": 8,
      "2:3": 8,
      "9:16": 8,
      "16:9": 8,
      "4:3": 8,
      "3:2": 8,
    },
    medium: {
      "1:1": 66,
      "4:5": 66,
      "3:4": 66,
      "2:3": 66,
      "9:16": 66,
      "16:9": 66,
      "4:3": 66,
      "3:2": 66,
    },
    high: {
      "1:1": 261,
      "4:5": 261,
      "3:4": 261,
      "2:3": 261,
      "9:16": 261,
      "16:9": 261,
      "4:3": 261,
      "3:2": 261,
    },
  },
} as const satisfies Readonly<
  Record<
    Resolution,
    Readonly<Record<Quality, Readonly<Record<AspectRatio, number>>>>
  >
>;

export function creditCost(
  resolution: Resolution,
  quality: Quality,
  aspectRatio: AspectRatio,
): number {
  return OFFICIAL_CREDIT_COSTS[resolution][quality][aspectRatio];
}

export function batchCreditCost(
  resolution: Resolution,
  quality: Quality,
  aspectRatio: AspectRatio,
  imageCount: ImageCount = IMAGES_PER_GENERATION,
): number {
  return creditCost(resolution, quality, aspectRatio) * imageCount;
}

export function isImageCount(value: number): value is ImageCount {
  return IMAGE_COUNTS.some((candidate) => candidate === value);
}

export function isResolution(value: string): value is Resolution {
  return RESOLUTIONS.some((candidate) => candidate === value);
}

export function isQuality(value: string): value is Quality {
  return QUALITIES.some((candidate) => candidate === value);
}

export function isAspectRatio(value: string): value is AspectRatio {
  return ASPECT_RATIOS.some((candidate) => candidate === value);
}
