import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
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

function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(18, Math.round(width / 42));
  const margin = Math.max(20, Math.round(width / 36));
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width - margin}" y="${height - margin}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fontSize}" letter-spacing="2" fill="white" fill-opacity="0.82" stroke="black" stroke-opacity="0.35" stroke-width="2">texttoposter.com</text></svg>`,
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
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;
  return sharp(image)
    .composite([{ input: watermarkSvg(width, height), gravity: "southeast" }])
    .png()
    .toBuffer();
}

export async function uploadPoster(path: string, image: Buffer): Promise<void> {
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
  const { data, error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not sign generated poster: ${error?.message ?? "missing URL"}`,
    );
  }
  return data.signedUrl;
}
