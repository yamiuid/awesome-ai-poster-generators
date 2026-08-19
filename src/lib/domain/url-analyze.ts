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
