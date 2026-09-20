import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { rootMetadata, SiteDocument } from "@/components/site-document";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

export const metadata: Metadata = rootMetadata;

/**
 * 法务页（privacy / terms / refunds / ai-policy）保持英文、不带语言前缀，
 * 与站内其它页面的 URL 规则一致：/ja/privacy 会被中间件 301 回 /privacy。
 */
export default function UnlocalizedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  setRequestLocale(DEFAULT_LOCALE);
  return <SiteDocument locale={DEFAULT_LOCALE}>{children}</SiteDocument>;
}
