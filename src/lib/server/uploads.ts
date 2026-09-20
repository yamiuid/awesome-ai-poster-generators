/** 参考图上传限制：类型、大小、像素总量 */
import { readImageInfo } from "./image-ops";

export const REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const REFERENCE_MAX_PIXELS = 24_000_000; // 约 6000×4000

const MIME_BY_SIGNATURE = [
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // RIFF（第 8-11 字节再验 WEBP）
  { mime: "image/webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
] as const;

/** 魔数嗅探图片真实类型，不信任请求的 Content-Type */
export function sniffImageMime(bytes: Uint8Array): string | null {
  for (const signature of MIME_BY_SIGNATURE) {
    if (bytes.length < signature.offset + signature.bytes.length) {
      continue;
    }
    const matched = signature.bytes.every(
      (byte, index) => bytes[signature.offset + index] === byte,
    );
    if (!matched) {
      continue;
    }
    if (signature.mime === "image/webp") {
      // RIFF 容器还需第 8-11 字节为 "WEBP"
      const webpMark = String.fromCharCode(
        bytes[8] ?? 0,
        bytes[9] ?? 0,
        bytes[10] ?? 0,
        bytes[11] ?? 0,
      );
      return webpMark === "WEBP" ? signature.mime : null;
    }
    return signature.mime;
  }
  return null;
}

export function referenceExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/**
 * 校验参考图：魔数 + 大小 + 像素总量。
 * 尺寸读取走 image-ops：Workers 上用 Images binding 的 .info()，Node 上用 sharp。
 * 返回嗅探出的 MIME；不合法时抛错。
 */
export async function assertReferenceImage(bytes: Buffer): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new Error("Reference image is empty.");
  }
  if (bytes.byteLength > REFERENCE_MAX_BYTES) {
    throw new Error("Reference image is too large.");
  }
  const mime = sniffImageMime(bytes);
  if (!mime) {
    throw new Error("Reference image must be JPEG, PNG or WebP.");
  }
  const info = await readImageInfo(bytes);
  if (info.width * info.height > REFERENCE_MAX_PIXELS) {
    throw new Error("Reference image has too many pixels.");
  }
  return mime;
}

// —— 简单内存限速（每实例独立，MVP 足够）——
const UPLOAD_WINDOW_MS = 60_000;
const UPLOAD_WINDOW_LIMIT = 10;
const uploadTimestamps = new Map<string, number[]>();

export function isUploadRateLimited(
  actorKey: string,
  now = Date.now(),
): boolean {
  const timestamps = (uploadTimestamps.get(actorKey) ?? []).filter(
    (timestamp) => now - timestamp < UPLOAD_WINDOW_MS,
  );
  if (timestamps.length >= UPLOAD_WINDOW_LIMIT) {
    uploadTimestamps.set(actorKey, timestamps);
    return true;
  }
  timestamps.push(now);
  uploadTimestamps.set(actorKey, timestamps);
  // 防止 Map 无限增长
  if (uploadTimestamps.size > 1000) {
    const cutoff = now - UPLOAD_WINDOW_MS;
    for (const [key, values] of uploadTimestamps) {
      if (values.every((timestamp) => timestamp < cutoff)) {
        uploadTimestamps.delete(key);
      }
    }
  }
  return false;
}
