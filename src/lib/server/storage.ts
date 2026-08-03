import ky from "ky";
import sharp from "sharp";
import { createSupabaseAdminClient } from "./supabase/admin";

function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(18, Math.round(width / 42));
  const margin = Math.max(20, Math.round(width / 36));
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width - margin}" y="${height - margin}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fontSize}" letter-spacing="2" fill="white" fill-opacity="0.82" stroke="black" stroke-opacity="0.35" stroke-width="2">texttoposter.com</text></svg>`,
  );
}

export async function downloadProviderImage(url: string): Promise<Buffer> {
  const response = await ky.get(url, { timeout: 30_000, retry: { limit: 2 } });
  return Buffer.from(await response.arrayBuffer());
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
