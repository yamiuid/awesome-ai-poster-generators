import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getServerEnv } from "./env";
import { createSupabaseAdminClient } from "./supabase/admin";

const MAX_PROVIDER_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PROVIDER_IMAGE_PIXELS = 40_000_000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 &&
        second !== undefined &&
        second >= 64 &&
        second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && second !== undefined && second >= 18 && second <= 19) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      (first !== undefined && first >= 224)
    );
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isPrivateAddress(normalized.slice("::ffff:".length));
  }
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("2001:db8")
  );
}

async function assertSafeProviderUrl(input: string): Promise<URL> {
  const url = new URL(input);
  if (url.protocol !== "https:") {
    throw new Error("Provider image URL must use HTTPS.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateAddress(hostname)
  ) {
    throw new Error("Provider image URL points to a private address.");
  }
  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true })).map((entry) => entry.address);
  if (addresses.some(isPrivateAddress)) {
    throw new Error("Provider image URL resolves to a private address.");
  }
  return url;
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error("Provider image is too large.");
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > MAX_PROVIDER_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("Provider image is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

const WATERMARK_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
};

export function watermarkSvg(width: number, height: number): Buffer {
  const label = "TEXTTOPOSTER.COM";
  const cellSize = Math.max(3, Math.round(width / 256));
  const margin = Math.max(20, Math.round(width / 36));
  const glyphWidth = cellSize * 5;
  const gap = cellSize;
  const labelWidth = label.length * glyphWidth + (label.length - 1) * gap;
  const left = width - margin - labelWidth;
  const top = height - margin - cellSize * 7;
  const blocks = label
    .split("")
    .flatMap((character, glyphIndex) => {
      const glyph = WATERMARK_GLYPHS[character];
      if (!glyph) {
        return [];
      }
      return glyph.flatMap((row, rowIndex) =>
        [...row].flatMap((pixel, columnIndex) =>
          pixel === "1"
            ? [
                `<rect x="${left + glyphIndex * (glyphWidth + gap) + columnIndex * cellSize}" y="${top + rowIndex * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
              ]
            : [],
        ),
      );
    })
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title>${label}</title><g fill="black" fill-opacity="0.45" transform="translate(2 2)">${blocks}</g><g fill="white" fill-opacity="0.9">${blocks}</g></svg>`,
  );
}

export async function downloadProviderImage(url: string): Promise<Buffer> {
  let current = await assertSafeProviderUrl(url);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error("Provider image redirected too many times.");
      }
      current = await assertSafeProviderUrl(
        new URL(location, current).toString(),
      );
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Provider image request failed with status ${response.status}.`,
      );
    }
    if (
      !response.headers.get("content-type")?.toLowerCase().startsWith("image/")
    ) {
      throw new Error("Provider returned a non-image response.");
    }
    const image = await readLimitedBody(response);
    // 按需加载 sharp：storage 模块被 generation 查询路由引用时不应触发原生库加载
    const { default: sharp } = await import("sharp");
    const metadata = await sharp(image).metadata();
    if (
      (metadata.width ?? 0) * (metadata.height ?? 0) >
      MAX_PROVIDER_IMAGE_PIXELS
    ) {
      throw new Error("Provider image has too many pixels.");
    }
    return image;
  }
  throw new Error("Provider image redirect failed.");
}

export async function bakeWatermark(image: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;
  return sharp(image)
    .composite([{ input: watermarkSvg(width, height), gravity: "southeast" }])
    .png()
    .toBuffer();
}

export async function uploadPoster(path: string, image: Buffer): Promise<void> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    await uploadPosterR2(path, image);
    return;
  }
  const { error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .upload(path, image, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new Error(`Could not persist generated poster: ${error.message}`);
  }
}

export async function createPosterUrl(path: string): Promise<string> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    return createPosterUrlR2(path);
  }
  const storage = createSupabaseAdminClient().storage.from("posters");
  // public 模式：posters bucket 需在 Supabase Dashboard 设为 public。
  // 用于绕过平台 signed URL 下载故障（"requested path is invalid"）。
  if (getServerEnv().POSTER_URL_MODE === "public") {
    const { data } = storage.getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error("Could not build public poster URL.");
    }
    return data.publicUrl;
  }
  const { data, error } = await storage.createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not sign generated poster: ${error?.message ?? "missing URL"}`,
    );
  }
  return data.signedUrl;
}

export async function deletePoster(paths: readonly string[]): Promise<void> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    await deletePosterR2(paths);
    return;
  }
  const { error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .remove([...paths]);
  if (error) {
    throw new Error(`Could not delete generated posters: ${error.message}`);
  }
}

// —— R2 实现（S3 兼容 API，public URL 无过期）——

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!s3Client) {
    const env = getServerEnv();
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        "R2_* credentials are required when STORAGE_PROVIDER=r2.",
      );
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

async function uploadPosterR2(path: string, image: Buffer): Promise<void> {
  const env = getServerEnv();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: path,
      Body: image,
      ContentType: "image/png",
      // key 含随机 UUID，内容不可变，可安全 long-cache
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

// 逐段 encodeURIComponent，避免 key 中特殊字符破坏 URL（当前 key 均为 [a-zA-Z0-9/-_.]）
export function keyToPublicUrl(path: string): string {
  const base = getServerEnv().R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("R2_PUBLIC_BASE_URL is required when STORAGE_PROVIDER=r2.");
  }
  return `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function createPosterUrlR2(path: string): Promise<string> {
  return Promise.resolve(keyToPublicUrl(path));
}

async function deletePosterR2(paths: readonly string[]): Promise<void> {
  const env = getServerEnv();
  const client = getS3Client();
  // DeleteObjects 单请求最多 1000 个 key，超出分块
  for (let index = 0; index < paths.length; index += 1000) {
    const chunk = paths.slice(index, index + 1000);
    const output = await client.send(
      new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      }),
    );
    if (output.Errors?.length) {
      // 部分删除失败：记日志不抛（cron 场景降级处理）
      console.error("R2 delete partial failure:", output.Errors);
    }
  }
}
