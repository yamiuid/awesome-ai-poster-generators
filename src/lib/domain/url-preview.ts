import { z } from "zod";

export const urlPreviewSchema = z.object({
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().default(""),
  description: z.string().default(""),
  siteName: z.string().default(""),
  favicon: z.string().url().optional(),
  content: z.string().default(""),
});

export type UrlPreview = z.infer<typeof urlPreviewSchema>;
