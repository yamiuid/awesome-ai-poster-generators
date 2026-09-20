/**
 * 允许被图片变换路由抓取的来源主机。
 *
 * 与 next.config.ts 的 images.remotePatterns 对应：海报与参考图托管在 R2 的
 * 公开自定义域名（默认 images.texttoposter.com，可由 R2_PUBLIC_BASE_URL 覆盖），
 * 也放行 r2.dev 回退域名。站内相对路径（/examples/*.webp）不走这里。
 */
const FIXED_HOSTS: readonly string[] = ["images.texttoposter.com"];

export function isAllowedImageHost(
  hostname: string,
  r2PublicBaseUrl?: string | undefined,
): boolean {
  const normalized = hostname.toLowerCase();
  if (FIXED_HOSTS.includes(normalized) || normalized.endsWith(".r2.dev")) {
    return true;
  }
  if (!r2PublicBaseUrl) {
    return false;
  }
  try {
    return new URL(r2PublicBaseUrl).hostname.toLowerCase() === normalized;
  } catch {
    return false;
  }
}
