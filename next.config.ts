import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // 把首屏 CSS 内联进 HTML，省掉 <link rel="stylesheet"> 的渲染阻塞往返（仅生产构建生效）。
    inlineCss: true,
  },
  env: {
    // Client-safe envs only. Do NOT expose secrets here.
    API_URL: process.env.API_URL,
  },
};

export default nextConfig;
