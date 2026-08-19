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
    // 本地开发默认 Supabase Storage（与 env.ts 默认一致）：签名 URL 需要浏览器
    // 直连，且 Node 侧优化器在无代理的开发环境拉不到图，直接关闭优化；
    // 生产显式设置 STORAGE_PROVIDER=r2（images.texttoposter.com）时保持默认优化。
    unoptimized: (process.env["STORAGE_PROVIDER"] ?? "supabase") !== "r2",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.texttoposter.com",
        pathname: "/**",
      },
      { protocol: "https", hostname: "**.r2.dev", pathname: "/**" },
      // 本地开发默认用 Supabase Storage（签名 URL）；生产走 R2 不受影响
      ...(process.env["NEXT_PUBLIC_SUPABASE_URL"]
        ? [
            {
              protocol: "https" as const,
              hostname: new URL(process.env["NEXT_PUBLIC_SUPABASE_URL"])
                .hostname,
              pathname: "/**" as const,
            },
          ]
        : []),
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
