import { setRequestLocale } from "next-intl/server";
import { toUiLocale, type UiLocale } from "./locale";

export type RouteParams = Readonly<{ params: Promise<{ locale: string }> }>;

/**
 * 打开静态渲染，并把本次渲染的语言固定成路由段里的值。
 *
 * next-intl 解析语言有两条路径：setRequestLocale 写入的请求级缓存，或请求头 `l`。
 * 只有命中缓存时才不去读 headers()——一读就整页退回动态渲染。Next 会把 layout、
 * page、generateMetadata 拆成各自的渲染过程，所以 [locale] 子树里每一个都要在
 * 开头调用一次；漏掉的话不只是静态化失效，语言也会回落成默认值。
 */
export async function resolveRouteLocale(
  params: Promise<{ locale: string }>,
): Promise<UiLocale> {
  const { locale } = await params;
  const resolved = toUiLocale(locale);
  setRequestLocale(resolved);
  return resolved;
}
