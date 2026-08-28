import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  localeFromPath,
  type UiLocale,
} from "@/lib/i18n/locale";
import { messagesForLocale } from "./messages";

export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  const headerLocale = requestHeaders.get("x-site-locale");
  const locale: UiLocale = headerLocale
    ? localeFromPath(`/${headerLocale}`)
    : DEFAULT_LOCALE;
  return { locale, messages: messagesForLocale(locale) };
});
