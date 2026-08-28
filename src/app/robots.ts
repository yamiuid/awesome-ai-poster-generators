import type { MetadataRoute } from "next";
import { UI_LOCALES } from "@/lib/i18n/locale";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/login",
        "/checkout",
        "/auth",
        "/api",
        ...UI_LOCALES.filter((locale) => locale !== "en").flatMap((locale) =>
          ["/account", "/login", "/checkout"].map(
            (path) => `/${locale}${path}`,
          ),
        ),
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
