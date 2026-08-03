import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const displayFont = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://texttoposter.com"),
  title:
    "Best AI Poster Maker 2026 — Create Stunning Posters from Text, Free & No Login",
  description:
    "Turn any text into beautiful AI posters instantly. No sign-up needed. Choose from 6 styles, generate 4 variants at once. Free AI poster maker from text, powered by the latest model.",
  alternates: { canonical: "/" },
  other: {
    "waffo-verify": "54d548993b3914275941eb86ae3982ec",
  },
  openGraph: {
    title: "AI Poster Maker — Generate Posters from Text in Seconds",
    description: "Turn a thought into four poster directions in seconds.",
    url: "https://texttoposter.com",
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
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
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
