import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import path from "node:path";

export default defineConfig({
  plugins: [
    vinext({
      // 边缘缓存：页面的服务端渲染不再读登录态，可以整体按静态/ISR 缓存。
      // cdnAdapter 走 Workers Cache，命中时不会跑 Worker 代码（零 CPU）。
      cache: { cdn: cdnAdapter() },
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
