import type { Metadata } from "next";

const siteUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ?? "https://texttoposter.com";
const siteName = "Text to Poster";

export const ogImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Text to Poster AI poster studio",
};

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
};

export function pageMeta({
  title,
  description,
  path,
}: PageMetaInput): Metadata {
  const url = `${siteUrl}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
