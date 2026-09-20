import { spawnSync } from "node:child_process";

/**
 * Cloudflare Workers 构建入口。
 *
 * 与 Vercel 构建的差别：vinext 的内置优化器只接受同源相对路径（见其
 * parseImageParams），远程 R2 图片会被 400 拒掉。这个开关让 next.config 换用
 * 自定义 loader（指向 /api/img，用 Cloudflare Images 做变换）。显式传环境变量，
 * 避免依赖 npm_lifecycle_event 这类隐式状态。
 */
const result = spawnSync("vinext", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, IMAGE_UNOPTIMIZED: "1" },
});

process.exit(result.status ?? 1);
