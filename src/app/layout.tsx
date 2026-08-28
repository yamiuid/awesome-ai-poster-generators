import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { LocaleSuggestion } from "@/components/locale-suggestion";
import { siteUrl } from "@/lib/seo";
import "./globals.css";

const localTypeface = localFont({
  src: "./fonts/Geist-Regular.ttf",
  variable: "--font-local",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AI Poster Maker — Turn Anything into a Poster",
  description:
    "Describe an idea, paste your content, or drop a link. AI turns it into a poster worth sharing — free, no login.",
  other: {
    "waffo-verify": "54d548993b3914275941eb86ae3982ec",
  },
  openGraph: {
    title: "AI Poster Maker — Turn Anything into a Poster",
    description:
      "Turn an idea, content, or link into a poster worth sharing in seconds.",
    url: siteUrl,
    siteName: "Text to Poster",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Text to Poster AI poster studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Poster Maker — Turn Anything into a Poster",
    description:
      "Turn an idea, content, or link into a poster worth sharing in seconds.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const umamiWebsiteId = process.env["NEXT_PUBLIC_UMAMI_WEBSITE_ID"];
  const umamiScriptUrl = process.env["NEXT_PUBLIC_UMAMI_SCRIPT_URL"];
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${localTypeface.variable} h-full antialiased`}
    >
      <head>
        <meta name="msvalidate.01" content="896C512198E90A6BC88DC962F259BC8B" />
        <meta name="baidu-site-verification" content="codeva-DuEQZjohwj" />
        {process.env.NODE_ENV === "development" && (
          <>
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
            <Script
              src="//unpkg.com/react-scan/dist/auto.global.js"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
          </>
        )}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-P36HDHF4KN"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-P36HDHF4KN');`}
        </Script>
        <Script id="microsoft-clarity" strategy="beforeInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "y0nc1qmg8a");`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleSuggestion />
          {children}
        </NextIntlClientProvider>
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
