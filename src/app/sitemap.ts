import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/privacy", "/terms", "/refunds", "/ai-policy"].map(
    (path) => ({
      url: `https://texttoposter.com${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: path === "" ? 1 : 0.6,
    }),
  );
}
