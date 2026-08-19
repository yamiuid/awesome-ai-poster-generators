import { z } from "zod";
import type { UrlPreview } from "./url-preview";

export const BRIEF_CHAR_LIMITS = {
  headline: 80,
  subtitle: 120,
  point: 120,
  cta: 120,
} as const;

export const BRIEF_POINT_COUNT = 3;

export const briefFieldsSchema = z.object({
  headline: z.string().trim().max(BRIEF_CHAR_LIMITS.headline),
  subtitle: z.string().trim().max(BRIEF_CHAR_LIMITS.subtitle).default(""),
  points: z
    .array(z.string().trim().max(BRIEF_CHAR_LIMITS.point))
    .max(BRIEF_POINT_COUNT)
    .default([]),
  cta: z.string().trim().max(BRIEF_CHAR_LIMITS.cta).default(""),
});

export type BriefFields = z.infer<typeof briefFieldsSchema>;

export function parseLooseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in the response.");
    }
    return JSON.parse(match[0]);
  }
}

export function normalizeBriefFields(value: unknown): BriefFields | null {
  const parsed = briefFieldsSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const fields = parsed.data;
  const points = [
    ...fields.points,
    ...Array.from(
      { length: Math.max(0, BRIEF_POINT_COUNT - fields.points.length) },
      () => "",
    ),
  ].slice(0, BRIEF_POINT_COUNT);
  return { ...fields, points };
}

export function buildBriefPrompt(fields: BriefFields): string {
  return [fields.headline, fields.subtitle, ...fields.points, fields.cta]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

export function buildFallbackPrompt(input: {
  inputType: "url" | "text";
  prompt: string;
  preview?: Pick<UrlPreview, "domain" | "title" | "description"> | null;
}): string {
  if (input.inputType === "url") {
    const titleAndDescription = [
      input.preview?.title,
      input.preview?.description,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" — ");
    if (titleAndDescription) {
      return titleAndDescription.slice(0, 1500);
    }
    const domain = input.preview?.domain ?? safeDomainFromUrl(input.prompt);
    return domain ? `A poster about ${domain}` : "A poster about this website";
  }
  return input.prompt.trim().slice(0, 600);
}

function safeDomainFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
