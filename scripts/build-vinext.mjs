import { spawnSync } from "node:child_process";

/**
 * Cloudflare Workers 构建入口。与 Vercel 构建的差别是两个环境变量，显式传参
 * 而不是依赖 npm_lifecycle_event 这类隐式状态：
 *
 * - IMAGE_UNOPTIMIZED=1：vinext 的内置优化器只接受同源相对路径（其
 *   parseImageParams 会拒绝绝对 URL），远程 R2 图片一律 400，所以关掉它。
 * - NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN：展示用的海报图片改走该 zone 的
 *   /cdn-cgi/image/ 在线变换（见 src/lib/image-delivery.ts），原图仍在 R2。
 */
const result = spawnSync("vinext", ["build"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    IMAGE_UNOPTIMIZED: "1",
    NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN:
      process.env["NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN"] ??
      "https://texttoposter.com",
  },
});

process.exit(result.status ?? 1);
