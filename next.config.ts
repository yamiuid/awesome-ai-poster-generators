import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // 本地 dev 的 HMR WebSocket 默认只放行 localhost，用 127.0.0.1 打开会被拒
  // 导致浏览器报 ERR_INVALID_HTTP_RESPONSE（服务端返回裸 Unauthorized）
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  typescript: { ignoreBuildErrors: false },
  async headers() {
    const scriptSources = [
      "'self'",
      "'unsafe-inline'",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://www.clarity.ms",
      "https://*.clarity.ms",
      "https://challenges.cloudflare.com",
    ];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSources.join(" ")}`,
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.clarity.ms https://*.bing.com https://challenges.cloudflare.com",
              "img-src 'self' data: blob: https://images.texttoposter.com https://*.r2.dev https://*.supabase.co https://*.clarity.ms https://*.bing.com https://www.google-analytics.com",
              "font-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "frame-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://accounts.google.com",
              "form-action 'self' https://*.supabase.co",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  // 海报图片托管在 Cloudflare R2（public 自定义域名或 r2.dev fallback），
  // 交给 next/image 优化器自动输出 WebP/AVIF；下载仍用源 URL（PNG）。
  images: {
    // 本地开发默认 Supabase Storage（与 env.ts 默认一致）：签名 URL 需要浏览器
    // 直连，且 Node 侧优化器在无代理的开发环境拉不到图，直接关闭优化；
    // 生产显式设置 STORAGE_PROVIDER=r2（images.texttoposter.com）时保持默认优化。
    // vinext 的内置优化器只接受同源相对路径（其 parseImageParams 会拒绝绝对
    // URL），远程 R2 图片会被 400 拒掉；而 images.loader（自定义 loader）虽然会
    // 打进客户端 bundle，vinext 的服务端 SSR 却忽略它——HTML 里仍然是
    // /_next/image，前后端不一致。所以 Workers 构建先关掉优化器、图片直出 R2。
    // /api/img 路由与 src/lib/image-loader.ts 是为后续恢复优化准备的（见 README），
    // 等 vinext 的 SSR 支持自定义 loader 后再接上。
    unoptimized:
      process.env["IMAGE_UNOPTIMIZED"] === "1" ||
      (process.env["STORAGE_PROVIDER"] ?? "supabase") !== "r2",
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
    // Vercel 图片优化器默认只缓存 60 秒（minimumCacheTTL 默认值），而 R2 的对象
    // key 含随机 UUID、内容不可变。缓存拉长到 31 天，避免同一张海报被反复送去
    // 跑一次 sharp 解码 + 缩放（那是实打实的 CPU）。
    minimumCacheTTL: 2678400,
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
  experimental: {
    // 客户端路由缓存：默认对动态路由是 0 秒，导致每次点导航（乃至同页 hash 跳转）
    // 都要重新等服务端渲染完才换页。给 30 秒后，回访/来回切换是瞬时的，
    // 首次访问仍有上面的 loading.tsx 骨架兜底。
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
