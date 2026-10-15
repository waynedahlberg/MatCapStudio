import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
