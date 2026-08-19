// 存量海报迁移脚本：Supabase Storage → Cloudflare R2（S3 兼容 API）
// 用法：
//   pnpm migrate:r2:dry-run   # 只列出待迁移 key，不下载不上传
//   pnpm migrate:r2            # 实跑（幂等：R2 已存在的 key 自动跳过）
//
// 环境变量（优先 process.env，缺失时读取根目录 .env.local）：
//   NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（源）
//   R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET（目标）
//   R2_PUBLIC_BASE_URL（可选，仅 dry-run 展示 URL 用）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

// —— 简易 env 读取（不引入 dotenv 依赖）——
function loadEnv() {
  const env = {};
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function requireEnv(fileEnv, key) {
  const value = process.env[key] ?? fileEnv[key];
  if (!value) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
  return value;
}

const fileEnv = loadEnv();
const SUPABASE_URL = requireEnv(fileEnv, "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv(fileEnv, "SUPABASE_SERVICE_ROLE_KEY");
const R2_ACCOUNT_ID = requireEnv(fileEnv, "R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = requireEnv(fileEnv, "R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = requireEnv(fileEnv, "R2_SECRET_ACCESS_KEY");
const R2_BUCKET = requireEnv(fileEnv, "R2_BUCKET");
const R2_PUBLIC_BASE_URL = (
  process.env.R2_PUBLIC_BASE_URL ??
  fileEnv.R2_PUBLIC_BASE_URL ??
  ""
).replace(/\/+$/, "");

const supabaseHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// —— 查询 Supabase 存量（generated_assets 去重 storage_path）——
async function listSourceKeys() {
  const seen = new Set();
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/generated_assets?select=storage_path&limit=${limit}&offset=${offset}`,
      { headers: supabaseHeaders },
    );
    if (!res.ok) {
      throw new Error(
        `Query generated_assets failed: ${res.status} ${await res.text()}`,
      );
    }
    const rows = await res.json();
    for (const row of rows) {
      if (row.storage_path) seen.add(row.storage_path);
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return [...seen];
}

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (error) {
    const status =
      error?.$metadata?.httpStatusCode ?? error?.$metadata?.statusCode ?? 0;
    if (status === 404) return false;
    throw error;
  }
}

async function downloadFromSupabase(key) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/posters/${key}`, {
    headers: supabaseHeaders,
  });
  if (!res.ok) {
    throw new Error(`Download ${key} failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

// —— 主流程 ——
async function main() {
  console.log(`Mode: ${DRY_RUN ? "dry-run" : "real"}`);
  console.log(`Source: ${SUPABASE_URL}`);
  console.log(
    `Target: ${R2_BUCKET} @ ${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  );

  const keys = await listSourceKeys();
  console.log(`Source keys: ${keys.length}`);
  if (DRY_RUN) {
    for (const key of keys) {
      const url = R2_PUBLIC_BASE_URL
        ? `${R2_PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`
        : "(R2_PUBLIC_BASE_URL not set)";
      console.log(`  ${key} -> ${url}`);
    }
    console.log("Dry run complete. Run `pnpm migrate:r2` to migrate.");
    return;
  }

  let migrated = 0;
  let skipped = 0;
  const failed = [];

  // 并发度 5
  const concurrency = 5;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      const key = keys[index];
      if (key === undefined) return;
      try {
        if (await objectExists(key)) {
          skipped += 1;
          console.log(`  skip  ${key}`);
          continue;
        }
        const body = await downloadFromSupabase(key);
        await uploadToR2(key, body);
        migrated += 1;
        console.log(`  ok    ${key} (${body.length} bytes)`);
      } catch (error) {
        failed.push({ key, error: error.message });
        console.error(`  FAIL  ${key}: ${error.message}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, keys.length) }, worker),
  );

  console.log("\n=== Summary ===");
  console.log(`migrated: ${migrated}`);
  console.log(`skipped:  ${skipped}`);
  console.log(`failed:   ${failed.length}`);
  if (failed.length > 0) {
    for (const f of failed) console.error(`  ${f.key}: ${f.error}`);
    process.exit(1);
  }
}

await main();
