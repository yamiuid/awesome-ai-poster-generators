import { watermarkOverlay } from "./watermark-png";

/**
 * 图片处理的两个后端。
 *
 * - Workers：Cloudflare Images binding。它在边缘解码/编码，Worker 本身不做像素运算，
 *   因此不受 128MB 内存和 CPU 限制影响，也不需要把 sharp 的原生库搬上去。
 * - Node（Vercel）：sharp。迁移期间线上仍是 Vercel，保持行为不变；切换完成后可以删掉。
 *
 * 两个后端共用同一份水印叠加层（watermark-png.ts），所以访客海报的水印外观一致。
 */

export type ImageInfo = Readonly<{
  width: number;
  height: number;
  format: string;
}>;

/** Images binding 的最小类型描述（只为用到的几个方法引入结构类型） */
type ImageHandle = Readonly<{
  transform(options: Record<string, unknown>): ImageHandle;
  draw(overlay: ImageHandle, options: Record<string, unknown>): ImageHandle;
  output(options: { format: string }): Promise<ImageOutput>;
}>;

type ImageOutput = Readonly<{ response(headers?: HeadersInit): Response }>;

type ImagesBinding = Readonly<{
  input(stream: ReadableStream): ImageHandle;
  info(stream: ReadableStream): Promise<{
    width?: number;
    height?: number;
    format?: string;
  }>;
}>;

/**
 * 取 Workers 的 Images binding。`cloudflare:workers` 只在 workerd 里存在：
 * vite 构建时用 @vite-ignore 交给运行时解析，Node/Next 构建时这个动态 import
 * 解析不到、被 try/catch 吞掉，于是自动回落到 sharp。
 */
async function cloudflareImages(): Promise<ImagesBinding | undefined> {
  try {
    const specifier = ["cloudflare", "workers"].join(":");
    const module = (await import(/* @vite-ignore */ specifier)) as {
      env?: { IMAGES?: ImagesBinding };
    };
    return module.env?.IMAGES;
  } catch {
    return undefined;
  }
}

function toStream(bytes: Buffer): ReadableStream {
  return new Blob([new Uint8Array(bytes)]).stream();
}

export async function readImageInfo(bytes: Buffer): Promise<ImageInfo> {
  const images = await cloudflareImages();
  if (images) {
    // .info() 不计费，也不做完整解码
    const info = await images.info(toStream(bytes));
    return {
      width: info.width ?? 0,
      height: info.height ?? 0,
      format: info.format ?? "",
    };
  }
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(bytes).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "",
  };
}

/** 给访客海报打水印；输出始终是 PNG。 */
export async function bakeWatermark(image: Buffer): Promise<Buffer> {
  const { width, height } = await readImageInfo(image);
  const targetWidth = width || 1024;
  const targetHeight = height || 1024;
  const overlay = watermarkOverlay(targetWidth);
  const inset = Math.max(0, overlay.metrics.margin - overlay.shadowOffset);

  const images = await cloudflareImages();
  if (images) {
    const output = await images
      .input(toStream(image))
      .draw(images.input(toStream(overlay.png)), { right: inset, bottom: inset })
      .output({ format: "image/png" });
    return Buffer.from(await output.response().arrayBuffer());
  }

  const { default: sharp } = await import("sharp");
  return sharp(image)
    .composite([
      {
        input: overlay.png,
        left: targetWidth - overlay.metrics.margin - overlay.metrics.labelWidth,
        top: targetHeight - overlay.metrics.margin - overlay.metrics.labelHeight,
      },
    ])
    .png()
    .toBuffer();
}
