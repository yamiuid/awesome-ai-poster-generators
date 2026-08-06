import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地 IDE 的 TS 语言服务独占 next-env.d.ts 导致构建 EPERM，类型检查由 tsc --noEmit 单独把关
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
