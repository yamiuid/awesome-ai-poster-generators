import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { ErrorToast } from "@/components/error-toast";
import { LocaleSuggestion } from "@/components/locale-suggestion";
import type { UiLocale } from "@/lib/i18n/locale";
import { siteUrl } from "@/lib/seo";
import "@/app/globals.css";

const localTypeface = localFont({
  src: "../app/fonts/Geist-Regular.ttf",
  variable: "--font-local",
  display: "swap",
});

/**
 * 全站共用的文档外壳。
 *
 * 本地化子树（app/[locale]）与不本地化的法务子树（app/(unlocalized)）各有一个
 * 根布局，但 html/body、字体、统计脚本与 i18n Provider 只有这一份实现。
 * 这里不读 cookies()/headers()：语言由调用方通过 [locale] 路由段传入，
 * 静态页才能在构建期预渲染，而不是每次访问都跑一次服务端渲染。
 */
export async function SiteDocument({
  locale,
  children,
}: Readonly<{ locale: UiLocale; children: React.ReactNode }>) {
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
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ErrorToast />
          <LocaleSuggestion />
          <AnalyticsConsent />
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

export const rootMetadata: Metadata = {
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
