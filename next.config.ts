import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.189.126"],
  images: {
    deviceSizes: [640, 750, 828, 1080],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    qualities: [75],
    remotePatterns: [
      { protocol: "https", hostname: "shared.fastly.steamstatic.com" },
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "cdn.akamai.steamstatic.com" },
      { protocol: "https", hostname: "store.akamai.steamstatic.com" },
      { protocol: "https", hostname: "avatars.fastly.steamstatic.com" },
      { protocol: "https", hostname: "avatars.akamai.steamstatic.com" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
