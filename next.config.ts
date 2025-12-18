import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  env: {
    // Client-safe envs only. Do NOT expose secrets here.
    API_URL: process.env.API_URL,
  },
};

export default nextConfig;
