/**
 * next/image 自定义 loader（当前**未接线**，见 README 的 Cloudflare 段落）。
 *
 * 背景：vinext 内置的 /_next/image 只接受同源相对路径，远程 R2 图片会被 400
 * 拒掉。这里把图片 URL 指向 /api/img（用 Cloudflare Images 做变换 + Workers
 * Cache）。它已经能在客户端生效，但 vinext 的 SSR 端目前忽略 images.loader，
 * HTML 仍会输出 /_next/image，前后端不一致，所以暂时没有启用。
 */
type ImageLoaderArgs = Readonly<{
  src: string;
  width: number;
  quality?: number;
}>;

export default function posterImageLoader({
  src,
  width,
  quality,
}: ImageLoaderArgs): string {
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality ?? 75),
  });
  return `/api/img?${params.toString()}`;
}
