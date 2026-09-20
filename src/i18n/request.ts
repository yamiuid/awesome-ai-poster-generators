import { getRequestConfig } from "next-intl/server";
import { toUiLocale } from "@/lib/i18n/locale";
import { messagesForLocale } from "./messages";

/**
 * 语言解析不再读请求头。
 *
 * 以前这里 `await headers()` 取中间件塞的 x-site-locale，而根布局必须拿到语言，
 * 于是**全站每一页**（连 /about、/privacy 这类纯静态页）都被拖成动态渲染，
 * 每次访问都要跑一次服务端渲染。现在语言来自 [locale] 路由段：next-intl 通过
 * requestLocale 传进来，静态页可以在构建期预渲染；法务页不在该子树里，
 * requestLocale 为空 → 回落默认语言。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = toUiLocale(await requestLocale);
  return { locale, messages: messagesForLocale(locale) };
});
