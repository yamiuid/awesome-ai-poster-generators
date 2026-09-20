/**
 * 海报图片的交付层变换。
 *
 * R2 仍是唯一来源（原图不删、下载仍给原图 PNG）；展示路径上套一层 Cloudflare
 * 在线图片变换（`/cdn-cgi/image/...`），把 1–2 MB 的 PNG 变成几十 KB 的
 * AVIF/WebP，并由 Cloudflare 边缘缓存，不消耗 Worker CPU。
 *
 * 只在构建时注入了 NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN 时启用（Workers 构建指向
 * 已开启 Image Resizing 的 zone）。Vercel 构建留空，继续用 next/image 的内置
 * 优化器（sharp），行为不变。
 */
const TRANSFORM_ORIGIN = process.env["NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN"];

export function posterSrc(url: string, width: number): string {
  if (!TRANSFORM_ORIGIN || !url.startsWith("https://")) {
    return url;
  }
  const options = `width=${width},format=auto,quality=82`;
  return `${TRANSFORM_ORIGIN}/cdn-cgi/image/${options}/${encodeURIComponent(url)}`;
}
