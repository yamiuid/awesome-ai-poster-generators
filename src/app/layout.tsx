import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const localTypeface = localFont({
  src: "./fonts/Geist-Regular.ttf",
  variable: "--font-local",
  display: "swap",
});

const siteUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ?? "https://www.texttoposter.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AI Poster Maker 2026 — Free Posters from Text, No Login",
  description:
    "Turn any text into beautiful AI posters instantly — no sign-up needed. 6 styles, 4 variants at once. Free AI poster maker powered by the latest model.",
  alternates: { canonical: "/" },
  other: {
    "waffo-verify": "54d548993b3914275941eb86ae3982ec",
  },
  openGraph: {
    title: "AI Poster Maker — Generate Posters from Text in Seconds",
    description: "Turn a thought into four poster directions in seconds.",
    url: siteUrl,
    siteName: "Text to Poster",
    type: "website",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "Text to Poster AI poster studio",
      },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/og.svg"] },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const umamiWebsiteId = process.env["NEXT_PUBLIC_UMAMI_WEBSITE_ID"];
  const umamiScriptUrl = process.env["NEXT_PUBLIC_UMAMI_SCRIPT_URL"];
  return (
    <html lang="en" className={`${localTypeface.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {umamiWebsiteId && umamiScriptUrl && (
          <Script
            src={umamiScriptUrl}
            data-website-id={umamiWebsiteId}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
