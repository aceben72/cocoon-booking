import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mcusercontent.com",
      },
    ],
  },
};

export default nextConfig;
