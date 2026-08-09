import type { MetadataRoute } from "next";

const siteUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ?? "https://texttoposter.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/login", "/checkout", "/auth", "/api"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
