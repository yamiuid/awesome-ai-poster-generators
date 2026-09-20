import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import vinext from "vinext";
import { defineConfig } from "vite";

const cdn = ((descriptor: ReturnType<typeof cdnAdapter>) => {
  const { options: _options, ...withoutOptions } = descriptor;
  return withoutOptions;
})(cdnAdapter());

const optimizer = ((descriptor: ReturnType<typeof imagesOptimizer>) => {
  const { options: _options, ...withoutOptions } = descriptor;
  return withoutOptions;
})(imagesOptimizer());

export default defineConfig({
  plugins: [
    vinext({
      // 边缘缓存：页面的服务端渲染不再读登录态，可以整体按静态/ISR 缓存。
      // cdnAdapter 走 Workers Cache，命中时不会跑 Worker 代码（零 CPU）。
      cache: { cdn },
      // next/image 的 /_next/image 交给 Cloudflare Images 做在线变换
      // （缩放 + AVIF/WebP 协商 + 质量），Worker 自己不做像素运算。
      images: { optimizer },
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
      sharp: path.resolve(__dirname, "empty-stub.js"),
    },
  },
});
