import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import path from "node:path";

export default defineConfig({
  plugins: [
    vinext({
      // 边缘缓存：页面的服务端渲染不再读登录态，可以整体按静态/ISR 缓存。
      // cdnAdapter 走 Workers Cache，命中时不会跑 Worker 代码（零 CPU）。
      cache: { cdn: cdnAdapter() },
      // next/image 的 /_next/image 交给 Cloudflare Images 做在线变换
      // （缩放 + AVIF/WebP 协商 + 质量），Worker 自己不做像素运算。
      images: { optimizer: imagesOptimizer() },
      prerender: { routes: "*" },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: {
      "sharp": path.resolve(__dirname, "empty-stub.js"),
    },
  },
});
