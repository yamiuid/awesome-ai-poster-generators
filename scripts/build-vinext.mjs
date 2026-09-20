import { spawnSync } from "node:child_process";

/**
 * Cloudflare Workers 构建入口。
 *
 * 与 Vercel 构建的唯一差别：vinext 的 /_next/image 只接受同源相对路径
 * （见其 parseImageParams），远程 R2 图片会被 400 拒掉，所以 Workers 构建
 * 关闭内置优化器、让图片直出 R2 公开域名。这里显式传环境变量，避免依赖
 * npm_lifecycle_event 这类隐式状态。
 */
const result = spawnSync("vinext", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, IMAGE_UNOPTIMIZED: "1" },
});

process.exit(result.status ?? 1);
