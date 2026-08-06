import type { MetadataRoute } from "next";

const siteUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ?? "https://www.texttoposter.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/privacy", "/terms", "/refunds", "/ai-policy"].map(
    (path) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: path === "" ? 1 : 0.6,
    }),
  );
}
