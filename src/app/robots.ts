import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/login", "/checkout", "/auth", "/api"],
    },
    sitemap: "https://texttoposter.com/sitemap.xml",
  };
}
