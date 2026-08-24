import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

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
