import type { MetadataRoute } from "next";
import { STYLE_LANDINGS } from "@/lib/domain/style-landing";
import { siteUrl } from "@/lib/seo";

type SitemapEntry = { path: string; priority: number };

const coreEntries: SitemapEntry[] = [
  { path: "/", priority: 1 },
  { path: "/about", priority: 0.8 },
  { path: "/pricing", priority: 0.8 },
];

const styleEntries: SitemapEntry[] = STYLE_LANDINGS.map((landing) => ({
  path: `/${landing.slug}`,
  priority: 0.7,
}));

const legalEntries: SitemapEntry[] = [
  "/privacy",
  "/terms",
  "/refunds",
  "/ai-policy",
].map((path) => ({ path, priority: 0.4 }));

export default function sitemap(): MetadataRoute.Sitemap {
  return [...coreEntries, ...styleEntries, ...legalEntries].map(
    ({ path, priority }) => ({
      url: `${siteUrl}${path}`,
      changeFrequency: "monthly",
      priority,
    }),
  );
}
