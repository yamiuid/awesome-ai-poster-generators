import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地 dev 的 HMR WebSocket 默认只放行 localhost，用 127.0.0.1 打开会被拒
  // 导致浏览器报 ERR_INVALID_HTTP_RESPONSE（服务端返回裸 Unauthorized）
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // 本地 IDE 的 TS 语言服务独占 next-env.d.ts 导致构建 EPERM，类型检查由 tsc --noEmit 单独把关
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
