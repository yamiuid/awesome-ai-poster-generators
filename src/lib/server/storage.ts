import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getServerEnv } from "./env";
import { readImageInfo } from "./image-ops";
import { ipVersion, resolveHostAddresses } from "./net-guard";
import { createSupabaseAdminClient } from "./supabase/admin";

const MAX_PROVIDER_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_PROVIDER_IMAGE_PIXELS = 40_000_000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(address: string): boolean {
  if (ipVersion(address) === 4) {
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
  const addresses = ipVersion(hostname)
    ? [hostname]
    : await resolveHostAddresses(hostname);
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
    const info = await readImageInfo(image);
    if (info.width * info.height > MAX_PROVIDER_IMAGE_PIXELS) {
      throw new Error("Provider image has too many pixels.");
    }
    return image;
  }
  throw new Error("Provider image redirect failed.");
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

// —— 参考图（图生图上传件）：与海报同 bucket，references/ 前缀 ——

/**
 * 签名 URL 有效期（秒）。历史页会长时间停留，过短的签名会让早先加载的图片
 * 在 403 后裂图（图片本身仍在保留期内）。
 */
const POSTER_URL_TTL_SECONDS = 60 * 60;

export async function uploadReference(
  path: string,
  image: Buffer,
  contentType: string,
): Promise<void> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getServerEnv().R2_BUCKET,
        Key: path,
        Body: image,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return;
  }
  const { error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .upload(path, image, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new Error(`Could not persist reference image: ${error.message}`);
  }
}

/**
 * 参考图的可公网访问 URL（供 APIMart 拉取）。
 * signed 模式给 1 小时有效期：生成提交时即时消费，足够覆盖重试窗口。
 */
export async function createReferenceUrl(path: string): Promise<string> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    return keyToPublicUrl(path);
  }
  const storage = createSupabaseAdminClient().storage.from("posters");
  if (getServerEnv().POSTER_URL_MODE === "public") {
    const { data } = storage.getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error("Could not build public reference URL.");
    }
    return data.publicUrl;
  }
  const { data, error } = await storage.createSignedUrl(
    path,
    POSTER_URL_TTL_SECONDS,
  );
  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not sign reference image: ${error?.message ?? "missing URL"}`,
    );
  }
  return data.signedUrl;
}

export async function deleteReference(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    await deletePosterR2(paths);
    return;
  }
  const { error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .remove([...paths]);
  if (error) {
    throw new Error(`Could not delete reference images: ${error.message}`);
  }
}

const REFERENCE_PREFIX = "references/";

/**
 * 列出创建时间早于 cutoff 的参考图（供维护 cron 清理，30 天无保留价值）。
 * Supabase list 每页最多 1000，循环翻页；R2 用 ListObjectsV2。
 */
export async function listStaleReferences(cutoff: Date): Promise<string[]> {
  const stale: string[] = [];
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    const client = getS3Client();
    let continuationToken: string | undefined;
    do {
      const output = await client.send(
        new ListObjectsV2Command({
          Bucket: getServerEnv().R2_BUCKET,
          Prefix: REFERENCE_PREFIX,
          MaxKeys: 1000,
          ...(continuationToken
            ? { ContinuationToken: continuationToken }
            : {}),
        }),
      );
      for (const object of output.Contents ?? []) {
        if (object.Key && object.LastModified && object.LastModified < cutoff) {
          stale.push(object.Key);
        }
      }
      continuationToken = output.IsTruncated
        ? output.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return stale;
  }
  const storage = createSupabaseAdminClient().storage.from("posters");
  let offset = 0;
  while (true) {
    const { data } = await storage.list(REFERENCE_PREFIX, {
      limit: 1000,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    const objects = data ?? [];
    for (const object of objects) {
      if (
        object.name &&
        object.created_at &&
        new Date(object.created_at) < cutoff
      ) {
        stale.push(`${REFERENCE_PREFIX}${object.name}`);
      }
    }
    if (objects.length < 1000) {
      break;
    }
    offset += 1000;
  }
  return stale;
}

export async function createPosterUrl(path: string): Promise<string> {
  const [url] = await createPosterUrls([path]);
  if (!url) {
    throw new Error("Could not sign generated poster.");
  }
  return url;
}

/**
 * 批量签名：历史列表一次要签几十条路径，逐条调用 createSignedUrl 会产生 N 次
 * 网络往返（serverless 上很容易超时），这里走 Storage 的批量接口。
 * 批量结果按 path 匹配还原入参顺序；个别路径未返回时回退到单条签名，
 * 保证失败语义与单条版本一致（真的取不到就抛错，而不是静默丢图）。
 */
export async function createPosterUrls(
  paths: readonly string[],
): Promise<string[]> {
  if (paths.length === 0) {
    return [];
  }
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    return Promise.all(paths.map((path) => createPosterUrlR2(path)));
  }
  const storage = createSupabaseAdminClient().storage.from("posters");
  // public 模式：posters bucket 需在 Supabase Dashboard 设为 public。
  // 用于绕过平台 signed URL 下载故障（"requested path is invalid"）。
  if (getServerEnv().POSTER_URL_MODE === "public") {
    return paths.map((path) => {
      const { data } = storage.getPublicUrl(path);
      if (!data?.publicUrl) {
        throw new Error("Could not build public poster URL.");
      }
      return data.publicUrl;
    });
  }
  const { data, error } = await storage.createSignedUrls(
    [...paths],
    POSTER_URL_TTL_SECONDS,
  );
  if (error || !data) {
    throw new Error(
      `Could not sign generated posters: ${error?.message ?? "missing URLs"}`,
    );
  }
  const signedByPath = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) {
      signedByPath.set(entry.path, entry.signedUrl);
    }
  }
  return Promise.all(
    paths.map(async (path) => {
      const signed = signedByPath.get(path);
      if (signed) {
        return signed;
      }
      const { data: single, error: singleError } =
        await storage.createSignedUrl(path, POSTER_URL_TTL_SECONDS);
      if (singleError || !single?.signedUrl) {
        throw new Error(
          `Could not sign generated poster: ${singleError?.message ?? "missing URL"}`,
        );
      }
      return single.signedUrl;
    }),
  );
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
