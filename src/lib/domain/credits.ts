export const RESOLUTIONS = ["1k", "2k", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
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
 * GPT Image 2.5 Flare / Sunburst 官方通道最新计费档（积分/张）。
 * 价格只取决于 分辨率 × 质量：APIMart 最新价格表不再按宽高比区分。
 * 质量档位对应 low / medium / high / xhigh / max。
 */
const CREDIT_COSTS_PER_IMAGE = {
  "1k": { low: 2, medium: 4, high: 10, xhigh: 16, max: 34 },
  "2k": { low: 3, medium: 6, high: 18, xhigh: 32, max: 70 },
  "4k": { low: 4, medium: 8, high: 30, xhigh: 50, max: 115 },
} as const satisfies Readonly<
  Record<Resolution, Readonly<Record<Quality, number>>>
>;

export function creditCost(resolution: Resolution, quality: Quality): number {
  return CREDIT_COSTS_PER_IMAGE[resolution][quality];
}

// 图生图加价：每张参考图在文生图总价上加 1 积分（与分辨率/质量无关）
export const REFERENCE_IMAGE_COST = 1;

export function batchCreditCost(
  resolution: Resolution,
  quality: Quality,
  imageCount: ImageCount = IMAGES_PER_GENERATION,
  referenceImageCount = 0,
): number {
  return (
    creditCost(resolution, quality) * imageCount +
    REFERENCE_IMAGE_COST * referenceImageCount
  );
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
