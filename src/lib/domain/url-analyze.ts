import { z } from "zod";

export const urlAnalyzeEventSchema = z.object({
  step: z.number().int().min(0).max(6),
  status: z.enum(["running", "done", "error", "complete"]),
  data: z.unknown().optional(),
});

export type UrlAnalyzeEvent = z.infer<typeof urlAnalyzeEventSchema>;

export const pageUnderstandingSchema = z.object({
  pageType: z.string().trim().max(40),
  topic: z.string().trim().max(120),
  audience: z.string().trim().max(120),
  primaryMessage: z.string().trim().max(500),
  keyPoints: z.array(z.string().trim().max(200)).max(5).default([]),
});

export type PageUnderstanding = z.infer<typeof pageUnderstandingSchema>;

const lenientUnderstandingSchema = z.object({
  pageType: z.string(),
  topic: z.string(),
  audience: z.string().optional(),
  primaryMessage: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
});

/**
 * 宽松校验页面理解：模型偶尔超长输出时按上限截断，而不是直接拒绝。
 */
export function normalizePageUnderstanding(
  value: unknown,
): PageUnderstanding | null {
  const parsed = lenientUnderstandingSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const clamp = (text: string, max: number): string =>
    text.trim().slice(0, max);
  return {
    pageType: clamp(parsed.data.pageType, 40),
    topic: clamp(parsed.data.topic, 120),
    audience: parsed.data.audience ? clamp(parsed.data.audience, 120) : "",
    primaryMessage: parsed.data.primaryMessage
      ? clamp(parsed.data.primaryMessage, 500)
      : "",
    keyPoints: (parsed.data.keyPoints ?? [])
      .map((point) => clamp(point, 200))
      .slice(0, 5),
  };
}
