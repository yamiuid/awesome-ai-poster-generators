export const RESOLUTIONS = ["1k", "2k", "4k"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const QUALITIES = ["medium", "high"] as const;
export type Quality = (typeof QUALITIES)[number];

const MEDIUM_CREDIT_COSTS = {
  "1k": 1,
  "2k": 2,
  "4k": 4,
} as const satisfies Readonly<Record<Resolution, number>>;

const HIGH_CREDIT_COSTS = {
  "1k": 4,
  "2k": 8,
  "4k": 16,
} as const satisfies Readonly<Record<Resolution, number>>;

export const IMAGES_PER_GENERATION = 4 as const;
export const MONTHLY_CREDITS = 100 as const;

export function creditCost(resolution: Resolution, quality: Quality): number {
  return quality === "medium"
    ? MEDIUM_CREDIT_COSTS[resolution]
    : HIGH_CREDIT_COSTS[resolution];
}

export function batchCreditCost(
  resolution: Resolution,
  quality: Quality,
): number {
  return creditCost(resolution, quality) * IMAGES_PER_GENERATION;
}

export function isResolution(value: string): value is Resolution {
  return RESOLUTIONS.some((candidate) => candidate === value);
}

export function isQuality(value: string): value is Quality {
  return QUALITIES.some((candidate) => candidate === value);
}
