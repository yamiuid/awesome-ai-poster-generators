import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { rootMetadata, SiteDocument } from "@/components/site-document";
import { isUiLocale } from "@/lib/i18n/locale";
import { routing } from "@/lib/i18n/routing";

export const metadata: Metadata = rootMetadata;

/** 五个语言各预渲染一份，页面因此可以走 CDN 静态命中，不再逐次跑函数 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isUiLocale(locale)) {
    notFound();
  }
  // 让 next-intl 走「路由段」这条路径解析语言（静态渲染开关）
  setRequestLocale(locale);
  return <SiteDocument locale={locale}>{children}</SiteDocument>;
}
