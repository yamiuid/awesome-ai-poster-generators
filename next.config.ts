import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地 dev 的 HMR WebSocket 默认只放行 localhost，用 127.0.0.1 打开会被拒
  // 导致浏览器报 ERR_INVALID_HTTP_RESPONSE（服务端返回裸 Unauthorized）
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // 本地 IDE 的 TS 语言服务独占 next-env.d.ts 导致构建 EPERM，类型检查由 tsc --noEmit 单独把关
  typescript: { ignoreBuildErrors: true },
  // 海报图片托管在 Cloudflare R2（public 自定义域名或 r2.dev fallback），
  // 交给 next/image 优化器自动输出 WebP/AVIF；下载仍用源 URL（PNG）。
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.texttoposter.com",
        pathname: "/**",
      },
      { protocol: "https", hostname: "**.r2.dev", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  // Vercel 打包 serverless 函数时会裁剪 node_modules，sharp 的原生二进制
  // （@img/sharp-linux-x64 / @img/sharp-libvips-linux-x64）属于平台 optional 依赖，
  // 可能被裁掉导致运行时 dlopen 失败。这里显式把二进制打进使用 sharp 的路由
  // （生成推进 + cron 恢复），避免 ERR_DLOPEN_FAILED。
  outputFileTracingIncludes: {
    "/api/generations/[id]/advance": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
    "/api/cron/maintenance": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
};

export default nextConfig;
